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

const SYSTEM_PROMPT = `あなたは官公庁向け内部提案資料の構成を設計する専門家です。
ユーザーの依頼に基づき、PowerPoint 5枚前後の構成を JSON のみで返してください。

## 出力形式（厳守）
- マークダウンや説明文は禁止。JSON オブジェクト1つのみ
- スライドは ${DOCS_DEFAULT_SLIDES} 枚前後（最大 ${DOCS_MAX_SLIDES} 枚）
- 日本語。です・ます調。簡潔で分かりやすく
- 1スライドの箇条書きは最大4点、各40文字以内を目安
- **本文スライド（content / closing）には可能な限り visual を付ける** — 文字だけのスライドは避け、図解で伝える
- visual.type:
  - "flow": 手順・プロセス（左→右のフロー）
  - "comparison": 現状 vs 提案、Before/After など2列比較
  - "timeline": スケジュール・フェーズ（時系列）
  - "pyramid": 優先度・階層（上ほど重要）
  - "icons": キーワードを色付きオブジェクトで表現
- visual.labels は2〜5個、各12文字以内

## JSON スキーマ
{
  "documentTitle": "提案タイトル",
  "subtitle": "副題（任意）",
  "author": "所属・部門（任意、不明なら空文字）",
  "slides": [
    {
      "layout": "title",
      "title": "表紙タイトル",
      "subtitle": "副題",
      "bullets": []
    },
    {
      "layout": "content",
      "title": "背景と課題",
      "bullets": ["...", "..."],
      "visual": { "type": "comparison", "labels": ["現状", "課題"] }
    },
    {
      "layout": "content",
      "title": "提案概要",
      "bullets": ["...", "..."],
      "visual": { "type": "flow", "labels": ["調査", "設計", "導入", "評価"] }
    },
    {
      "layout": "content",
      "title": "具体施策",
      "bullets": ["...", "..."],
      "visual": { "type": "timeline", "labels": ["Phase1", "Phase2", "Phase3"] }
    },
    {
      "layout": "closing",
      "title": "期待効果と次のアクション",
      "bullets": ["...", "..."],
      "visual": { "type": "pyramid", "labels": ["効果", "施策", "基盤"] }
    }
  ]
}

layout は "title" | "content" | "closing" のみ。
最初のスライドは必ず title、最後は closing を推奨。`;

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
  return value === "title" || value === "content" || value === "closing";
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

function parseSlide(raw: unknown): DocSlideOutline | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const layout = obj.layout;
  const title = String(obj.title ?? "").trim();
  if (!isLayout(layout) || !title) return null;

  const bullets = Array.isArray(obj.bullets)
    ? obj.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
    : [];

  const visual = parseVisual(obj.visual);

  return {
    layout,
    title,
    subtitle: obj.subtitle ? String(obj.subtitle).trim() : undefined,
    bullets,
    visual,
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
      max_completion_tokens: 2500,
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
