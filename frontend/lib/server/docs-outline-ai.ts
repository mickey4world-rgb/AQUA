import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  formatAttachmentsForPrompt,
  normalizeAttachments,
} from "@/lib/server/council-attachments";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import { DOCS_DEFAULT_SLIDES, DOCS_MAX_SLIDES } from "@/lib/docs-utils";
import type {
  DocOutline,
  DocSlideLayout,
  DocSlideOutline,
  DocSlideVisual,
  DocVisualType,
  DocsChatMessage,
} from "@/lib/types/docs";
import { ensureOutlineImages } from "@/lib/server/docs-stock-images";

const SYSTEM_PROMPT = `あなたは内部提案向け PowerPoint の構成・編集デザインを設計する専門家です。
Gamma / Presenti のような「余白・階層・図解・写真」優先の緻密な資料を目指します。
ユーザーの依頼に基づき、JSON のみで返してください。

## 出力形式（厳守）
- マークダウンや説明文は禁止。JSON オブジェクト1つのみ
- スライドは ${DOCS_DEFAULT_SLIDES} 枚前後（最大 ${DOCS_MAX_SLIDES} 枚）
- 日本語。です・ます調。簡潔
- **1スライド1メッセージ**: 箇条書きは最大4点、各32文字以内
- keyMessage は任意だが、本文では1行（28文字以内）のリード文を推奨
- 文字だけのスライドは禁止。visual / cards / twoColumn / stat / image のいずれかを使う
- visual.labels は2〜5個、各10文字以内

## 画像（image）— Gamma風の自動写真
- 表紙（title）は必ず image を付ける（placement: "hero"）
- content の約半数に image（placement: "side"）を付ける。visual と両方ある場合は image を優先して右側に写真
- query は**英語** 2〜6語（例: "modern office collaboration", "data analytics dashboard", "city skyline dusk"）
- 人物の実名や実在企業ロゴを連想させるクエリは禁止
- cards / twoColumn / stat には image 不要（レイアウト自体がビジュアル）

## layout（必須で使い分ける）
- "title": 表紙（1枚目のみ）
- "section": 章扉（紺地・短いタイトル）。長い資料の区切りに1枚まで可
- "content": 左に要点＋右に visual または image（最も基本）
- "twoColumn": 左右比較（columns 必須・各2〜3点）
- "cards": 3〜4枚のカードグリッド（bullets=見出し、cardDetails=補足・同数）
- "stat": KPI・効果（stats 2〜4個。value は短く「30%」「3ヶ月」等）
- "closing": まとめ（最終）

visual.type:
- "flow" | "comparison" | "timeline" | "pyramid" | "icons"

## 構成のおすすめ
title（+hero画像）→（任意 section）→ content/twoColumn/cards/stat を混ぜる → closing
同じ layout を連続させすぎない。

## JSON スキーマ例
{
  "documentTitle": "提案タイトル",
  "subtitle": "副題",
  "author": "所属",
  "slides": [
    {
      "layout": "title",
      "title": "表紙",
      "subtitle": "副題",
      "bullets": [],
      "image": { "query": "modern business skyline", "placement": "hero" }
    },
    {
      "layout": "content",
      "title": "背景と課題",
      "keyMessage": "現状のボトルネックを特定する",
      "bullets": ["課題A", "課題B", "影響"],
      "image": { "query": "office workflow challenges", "placement": "side" }
    },
    {
      "layout": "twoColumn",
      "title": "現状と提案",
      "columns": [
        { "title": "現状", "bullets": ["手作業", "属人化"] },
        { "title": "提案", "bullets": ["自動化", "標準化"] }
      ],
      "bullets": []
    },
    {
      "layout": "cards",
      "title": "施策の柱",
      "bullets": ["可視化", "自動化", "定着"],
      "cardDetails": ["ダッシュボード", "定型処理の削減", "研修と運用"]
    },
    {
      "layout": "stat",
      "title": "期待効果",
      "stats": [
        { "value": "30%", "label": "工数削減" },
        { "value": "3ヶ月", "label": "導入期間" },
        { "value": "4部署", "label": "展開範囲" }
      ],
      "bullets": []
    },
    {
      "layout": "closing",
      "title": "次のアクション",
      "keyMessage": "小さく始めて効果を測る",
      "bullets": ["PoC範囲の確定", "関係者合意", "キックオフ"],
      "visual": { "type": "timeline", "labels": ["合意", "PoC", "展開"] }
    }
  ]
}`;

function trimHistory(history: DocsChatMessage[]): DocsChatMessage[] {
  return history.slice(-6);
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function isLayout(value: unknown): value is DocSlideLayout {
  return (
    value === "title" ||
    value === "section" ||
    value === "content" ||
    value === "twoColumn" ||
    value === "cards" ||
    value === "stat" ||
    value === "closing"
  );
}

function isVisualType(value: unknown): value is DocVisualType {
  return (
    value === "flow" ||
    value === "comparison" ||
    value === "timeline" ||
    value === "pyramid" ||
    value === "icons"
  );
}

function parseVisual(raw: unknown): DocSlideVisual | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!isVisualType(obj.type)) return undefined;
  const labels = Array.isArray(obj.labels)
    ? obj.labels.map((l) => String(l).trim()).filter(Boolean).slice(0, 5)
    : [];
  if (labels.length < 2) return undefined;
  return { type: obj.type, labels };
}

function parseImage(raw: unknown): DocSlideOutline["image"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const query = String(obj.query ?? "")
    .trim()
    .replace(/[^\w\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (query.length < 3) return undefined;
  const placement =
    obj.placement === "hero" || obj.placement === "side"
      ? obj.placement
      : undefined;
  return { query, placement };
}

function parseSlide(raw: unknown): DocSlideOutline | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const layout = obj.layout;
  const title = String(obj.title ?? "").trim();
  if (!isLayout(layout) || !title) return null;

  const bullets = Array.isArray(obj.bullets)
    ? obj.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
    : [];

  const columns = Array.isArray(obj.columns)
    ? obj.columns
        .map((col) => {
          if (!col || typeof col !== "object") return null;
          const c = col as Record<string, unknown>;
          const colTitle = String(c.title ?? "").trim();
          const colBullets = Array.isArray(c.bullets)
            ? c.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 4)
            : [];
          if (!colTitle || !colBullets.length) return null;
          return { title: colTitle, bullets: colBullets };
        })
        .filter((c): c is { title: string; bullets: string[] } => Boolean(c))
        .slice(0, 2)
    : undefined;

  const cardDetails = Array.isArray(obj.cardDetails)
    ? obj.cardDetails.map((d) => String(d).trim()).filter(Boolean).slice(0, 4)
    : undefined;

  const stats = Array.isArray(obj.stats)
    ? obj.stats
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const s = row as Record<string, unknown>;
          const value = String(s.value ?? "").trim();
          const label = String(s.label ?? "").trim();
          if (!value || !label) return null;
          return { value, label };
        })
        .filter((s): s is { value: string; label: string } => Boolean(s))
        .slice(0, 4)
    : undefined;

  const visual = parseVisual(obj.visual);
  const image = parseImage(obj.image);
  const keyMessage = obj.keyMessage
    ? String(obj.keyMessage).trim().slice(0, 40)
    : undefined;

  return {
    layout,
    title: title.slice(0, 48),
    subtitle: obj.subtitle ? String(obj.subtitle).trim().slice(0, 60) : undefined,
    keyMessage,
    bullets,
    columns: columns?.length === 2 ? columns : undefined,
    cardDetails: cardDetails?.length ? cardDetails : undefined,
    stats: stats?.length ? stats : undefined,
    visual,
    image,
  };
}

export function parseDocOutline(raw: unknown): DocOutline | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const documentTitle = String(obj.documentTitle ?? "").trim();
  if (!documentTitle) return null;

  if (!Array.isArray(obj.slides) || !obj.slides.length) return null;

  const slides = obj.slides
    .map(parseSlide)
    .filter((s): s is DocSlideOutline => Boolean(s))
    .slice(0, DOCS_MAX_SLIDES);

  if (!slides.length) return null;

  if (slides[0].layout !== "title") {
    slides.unshift({
      layout: "title",
      title: documentTitle,
      subtitle: obj.subtitle ? String(obj.subtitle).trim() : undefined,
      bullets: [],
    });
  }

  return {
    documentTitle,
    subtitle: obj.subtitle ? String(obj.subtitle).trim() : undefined,
    author: obj.author ? String(obj.author).trim() : undefined,
    slides,
  };
}

export type DocsOutlineAiResult =
  | { ok: true; outline: DocOutline; reply: string; model: string }
  | { ok: false; reason: string };

export async function generateDocOutline(
  userId: string,
  message: string,
  history: DocsChatMessage[] = [],
  previousOutline: DocOutline | null = null,
  attachmentsInput: unknown = null,
): Promise<DocsOutlineAiResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }
  if (trimmed.length > 1200) {
    return { ok: false, reason: "メッセージが長すぎます（1200文字以内）。" };
  }

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、資料生成は利用できません。",
    };
  }

  const attachmentResult = normalizeAttachments(attachmentsInput);
  if (!attachmentResult.ok) {
    return { ok: false, reason: attachmentResult.reason };
  }
  const attachments = attachmentResult.attachments;

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const attachmentBlock = formatAttachmentsForPrompt(attachments);
  const revisionBlock = previousOutline
    ? `\n\n【現在の構成（修正対象）】\n${JSON.stringify(previousOutline, null, 2)}`
    : "";

  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user",
      content: `${trimmed}${attachmentBlock}${revisionBlock}\n\n上記に基づき JSON を出力してください。`,
    },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 1800,
      messages,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, reason: "AI から構成案がありませんでした。" };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      return { ok: false, reason: "AI の出力を JSON として解析できませんでした。" };
    }

    const outline = parseDocOutline(parsed);
    if (!outline) {
      return { ok: false, reason: "構成案の形式が不正です。もう一度お試しください。" };
    }

    ensureOutlineImages(outline);

    const modelUsed = completion.model ?? model;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "docs-generate",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    const reply = previousOutline
      ? `構成を更新しました（${outline.slides.length}枚）。プレビューを確認し、pptx をダウンロードできます。`
      : `内部提案資料の構成を作成しました（${outline.slides.length}枚）。プレビューを確認し、pptx をダウンロードできます。`;

    return { ok: true, outline, reply, model: modelUsed };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `資料生成に失敗しました: ${error.message}`
          : "資料生成に失敗しました",
    };
  }
}
