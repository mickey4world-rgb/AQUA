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
  DocAzureArchitecture,
  DocAzureArchEdge,
  DocAzureArchNode,
  DocOutline,
  DocSlideLayout,
  DocSlideOutline,
  DocSlideVisual,
  DocVisualType,
  DocsChatMessage,
} from "@/lib/types/docs";
import { ensureOutlineImages } from "@/lib/server/docs-stock-images";
import {
  listAzureServicesForPrompt,
  normalizeAzureServiceId,
} from "@/lib/server/docs-azure-icons";

const AZURE_SERVICE_LIST = listAzureServicesForPrompt();

const SYSTEM_PROMPT = `あなたは内部提案向け PowerPoint の構成・編集デザインを設計する専門家です。
Gamma / Presenti のような「余白・階層・図解・写真」優先の緻密な資料を目指します。
クラウド／Azure の話では、公式 Azure アイコンによる想定構成図を必ず含めます。
ユーザーの依頼に基づき、JSON のみで返してください。

## 出力形式（厳守）
- マークダウンや説明文は禁止。JSON オブジェクト1つのみ
- スライドは ${DOCS_DEFAULT_SLIDES} 枚前後（最大 ${DOCS_MAX_SLIDES} 枚）
- 日本語。です・ます調。簡潔
- **1スライド1メッセージ**: 箇条書きは最大4点、各32文字以内
- keyMessage は任意だが、本文では1行（28文字以内）のリード文を推奨
- 文字だけのスライドは禁止。visual / cards / twoColumn / stat / image / azureArch のいずれかを使う
- visual.labels は2〜5個、各10文字以内

## 画像（image）— Gamma風の自動写真
- 表紙（title）は必ず image を付ける（placement: "hero"）
- content の約半数に image（placement: "side"）を付ける。visual / azureArch と両方ある場合は azureArch を優先
- query は**英語** 2〜6語
- 人物の実名や実在企業ロゴを連想させるクエリは禁止
- cards / twoColumn / stat / azureArch には image 不要

## Azure 構成図（azureArch）— 最重要
依頼に Azure・クラウド・構成図・App Service・Functions・Cosmos・OpenAI・SWA・AKS 等が含まれる、またはインフラ／システム構成の提案なら:
- layout "azureArch" のスライドを **1枚** 入れる（タイトル例: 「想定 Azure 構成」）
- azureArch.nodes は 4〜7個。各 node: { id, service, label }
- service は次の許可キーのみ: ${AZURE_SERVICE_LIST}
- label は日本語または短い役割名（例: Web, API, DB, 認証）
- edges でデータの流れを示す（from/to は node.id）。3〜6本
- 指示が曖昧でも、一般的なベストプラクティスで**想定構成**を描く（空にしない）
- 例: Web系 → front-door or app-gateway → app-service or static-web-apps → cosmos-db/sql-database + key-vault + entra-id + monitor
- AI系 → app-service/function-apps → openai + search + storage + key-vault

## layout（必須で使い分ける）
- "title": 表紙（1枚目のみ）
- "section": 章扉
- "content": 左に要点＋右に visual / image / azureArch
- "twoColumn": 左右比較
- "cards": 3〜4枚カード
- "stat": KPI
- "azureArch": Azure アイコン構成図（フル幅）。azureArch フィールド必須
- "closing": まとめ

visual.type: "flow" | "comparison" | "timeline" | "pyramid" | "icons"

## 構成のおすすめ
title →（任意 section）→ content/twoColumn/cards/stat/azureArch を混ぜる → closing

## JSON スキーマ例（Azure 提案時）
{
  "documentTitle": "Azure 基盤提案",
  "subtitle": "想定構成",
  "slides": [
    {
      "layout": "title",
      "title": "表紙",
      "subtitle": "クラウド構成案",
      "bullets": [],
      "image": { "query": "modern cloud datacenter", "placement": "hero" }
    },
    {
      "layout": "azureArch",
      "title": "想定 Azure 構成",
      "keyMessage": "エッジからデータ層まで分離する",
      "bullets": ["Front Door で入口を集約", "App Service で API", "Cosmos で永続化"],
      "azureArch": {
        "caption": "想定構成（指示内容からの推定）",
        "nodes": [
          { "id": "fd", "service": "front-door", "label": "入口" },
          { "id": "web", "service": "app-service", "label": "Web/API" },
          { "id": "db", "service": "cosmos-db", "label": "データ" },
          { "id": "kv", "service": "key-vault", "label": "秘密情報" },
          { "id": "id", "service": "entra-id", "label": "認証" },
          { "id": "mon", "service": "monitor", "label": "監視" }
        ],
        "edges": [
          { "from": "fd", "to": "web" },
          { "from": "web", "to": "db" },
          { "from": "web", "to": "kv" },
          { "from": "id", "to": "web", "label": "認証" },
          { "from": "web", "to": "mon" }
        ]
      }
    },
    {
      "layout": "closing",
      "title": "次のアクション",
      "bullets": ["構成レビュー", "PoC 範囲確定"],
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
    value === "azureArch" ||
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

function parseAzureArch(raw: unknown): DocAzureArchitecture | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes)) return undefined;

  const nodes: DocAzureArchNode[] = [];
  const seen = new Set<string>();
  for (const row of obj.nodes) {
    if (!row || typeof row !== "object") continue;
    const n = row as Record<string, unknown>;
    const id = String(n.id ?? "")
      .trim()
      .replace(/[^\w\-]/g, "")
      .slice(0, 24);
    const service = normalizeAzureServiceId(String(n.service ?? ""));
    const label = String(n.label ?? "").trim().slice(0, 18);
    if (!id || !service || !label || seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, service, label });
    if (nodes.length >= 8) break;
  }
  if (nodes.length < 3) return undefined;

  const idSet = new Set(nodes.map((n) => n.id));
  const edges: DocAzureArchEdge[] = [];
  if (Array.isArray(obj.edges)) {
    for (const row of obj.edges) {
      if (!row || typeof row !== "object") continue;
      const e = row as Record<string, unknown>;
      const from = String(e.from ?? "").trim();
      const to = String(e.to ?? "").trim();
      if (!idSet.has(from) || !idSet.has(to) || from === to) continue;
      edges.push({
        from,
        to,
        label: e.label ? String(e.label).trim().slice(0, 12) : undefined,
      });
      if (edges.length >= 10) break;
    }
  }

  return {
    caption: obj.caption ? String(obj.caption).trim().slice(0, 48) : undefined,
    nodes,
    edges: edges.length ? edges : undefined,
  };
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
  const azureArch = parseAzureArch(obj.azureArch);
  const keyMessage = obj.keyMessage
    ? String(obj.keyMessage).trim().slice(0, 40)
    : undefined;

  if (layout === "azureArch" && !azureArch) return null;

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
    azureArch,
  };
}

function looksLikeAzureRequest(text: string): boolean {
  return /azure|クラウド|構成図|インフラ|App\s*Service|Functions?|Cosmos|OpenAI|AKS|SWA|Static\s*Web|Key\s*Vault|Entra|VNet|Container\s*Apps|アーキテクチャ|システム構成/i.test(
    text,
  );
}

function defaultAzureArch(kind: "web" | "ai"): DocAzureArchitecture {
  if (kind === "ai") {
    return {
      caption: "想定構成（指示内容からの推定）",
      nodes: [
        { id: "user", service: "users", label: "利用者" },
        { id: "web", service: "app-service", label: "アプリ" },
        { id: "aoai", service: "openai", label: "OpenAI" },
        { id: "search", service: "search", label: "検索" },
        { id: "store", service: "storage", label: "ストレージ" },
        { id: "kv", service: "key-vault", label: "Key Vault" },
        { id: "mon", service: "monitor", label: "監視" },
      ],
      edges: [
        { from: "user", to: "web" },
        { from: "web", to: "aoai" },
        { from: "web", to: "search" },
        { from: "web", to: "store" },
        { from: "web", to: "kv" },
        { from: "web", to: "mon" },
      ],
    };
  }
  return {
    caption: "想定構成（指示内容からの推定）",
    nodes: [
      { id: "fd", service: "front-door", label: "入口" },
      { id: "web", service: "app-service", label: "Web/API" },
      { id: "db", service: "cosmos-db", label: "データ" },
      { id: "kv", service: "key-vault", label: "秘密情報" },
      { id: "id", service: "entra-id", label: "認証" },
      { id: "mon", service: "monitor", label: "監視" },
    ],
    edges: [
      { from: "fd", to: "web" },
      { from: "web", to: "db" },
      { from: "web", to: "kv" },
      { from: "id", to: "web", label: "認証" },
      { from: "web", to: "mon" },
    ],
  };
}

/** クラウド依頼なのに構成図が無い場合、想定図を1枚差し込む（空成功禁止） */
export function ensureOutlineAzureArch(outline: DocOutline, userMessage: string): void {
  const hasArch = outline.slides.some((s) => s.azureArch && s.azureArch.nodes.length >= 3);
  if (hasArch) return;
  if (!looksLikeAzureRequest(userMessage) && !looksLikeAzureRequest(outline.documentTitle)) {
    return;
  }
  const kind = /openai|gpt|llm|生成ai|rag|認知|ai\b/i.test(userMessage + outline.documentTitle)
    ? "ai"
    : "web";
  const arch = defaultAzureArch(kind);
  const slide: DocSlideOutline = {
    layout: "azureArch",
    title: "想定 Azure 構成",
    keyMessage: "指示内容から推定した構成案",
    bullets: arch.nodes.slice(0, 4).map((n) => `${n.label}（${n.service}）`),
    azureArch: arch,
  };
  // closing の直前、なければ末尾手前
  const closingIdx = outline.slides.findIndex((s) => s.layout === "closing");
  if (closingIdx >= 0) {
    outline.slides.splice(closingIdx, 0, slide);
  } else {
    outline.slides.push(slide);
  }
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
      max_completion_tokens: 2200,
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
    ensureOutlineAzureArch(outline, trimmed);

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
