import {
  generateWithGemini,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import { recordTokenUsage } from "@/lib/server/token-usage";
import {
  emptyConsultVisual,
  type ConsultVisualCard,
  type ConsultVisualDocument,
  type ConsultVisualHighlight,
  type ConsultVisualLayout,
} from "@/lib/types/consult-visual";
import {
  resolveWorksTopic,
  type WorkNoteDraft,
  type WorksChatMessage,
  type WorksTopicId,
} from "@/lib/types/works";

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;

const VALID_LAYOUTS = new Set<ConsultVisualLayout>([
  "flow",
  "comparison",
  "timeline",
  "pyramid",
  "icons",
  "cards",
  "highlights",
]);

const BASE_PERSONA = `あなたは IT / AI / クラウドに詳しいシニアエンジニア兼テックリードです。
相談者はプロダクトマネージャーで、自分でコードを書きながら試行錯誤するタイプです。

## 回答方針（reply フィールド）
- 日本語・です/ます調
- 結論を最初の2行で述べる
- 分かりやすい平易な説明。専門用語は必要最小限
- ソース引用・URL・文献名・根拠の羅列は不要
- 長いコードブロックやファイルパスの羅列は避ける（必要なら1行で触れる程度）
- 400〜900文字程度。見出し記号（#）は使わず、短い段落と箇条書き（-）のみ

## 図解方針（visual フィールド）
- 回答内容を視覚化する構成図・フロー・比較・タイムライン等を AI が最適な layout で選ぶ
- layout 候補: flow（手順・流れ）, comparison（2案比較）, timeline（段階）, pyramid（優先度）, icons（構成要素）, cards（論点カード）, highlights（数値・結論ハイライト）
- title は20文字以内、subtitle は40文字以内
- labels は図中ラベル（2〜5個、各12文字以内）
- cards は2〜4枚（title 12文字以内、body 60文字以内）
- highlights は0〜3件
- bullets は図解下の要点（2〜4件、各40文字以内）`;

const TOPIC_PROMPTS: Record<WorksTopicId, string> = {
  "claude-code": `${BASE_PERSONA}

## このスレッドの前提
AQUA Personal Apps（Next.js / Azure / Cosmos DB）を Claude Code で開発中。
実装の方向性と次の一手を、PM が理解できる言葉で説明する。`,

  architecture: `${BASE_PERSONA}

## このスレッドの前提
Next.js / Azure / Cosmos DB の設計・インフラ相談。
コスト・運用・セキュリティのトレードオフを平易に説明する。`,

  ai: `${BASE_PERSONA}

## このスレッドの前提
AI 活用（モデル選定・プロンプト・コスト）の相談。
無料枠や安価な代替があれば簡潔に提案する。`,

  general: `${BASE_PERSONA}

## このスレッドの前提
IT 全般の技術相談。前提を補いながら、実際に動ける順序で説明する。`,
};

const RESPONSE_SCHEMA = `必ず次の JSON のみを返してください（前後に説明文やコードフェンスを付けない）。

{
  "reply": "相談への分かりやすい回答テキスト",
  "visual": {
    "title": "図解タイトル",
    "subtitle": "一行サマリー",
    "layout": "flow",
    "labels": ["ラベル1", "ラベル2"],
    "cards": [{ "title": "論点", "body": "説明", "tone": "cyan" }],
    "highlights": [{ "label": "推奨", "value": "結論", "caption": "理由" }],
    "bullets": ["要点1", "要点2"]
  }
}`;

const SUMMARY_PROMPT = `あなたは技術相談の記録係です。
これまでの会話から、後で Claude Code に渡して実装を再開できる「作業メモ」を作成します。

必ず次の JSON のみを返してください（前後に説明文やコードフェンスを付けない）。

{
  "title": "40文字以内の日本語タイトル",
  "summary": "相談内容と結論を3〜5行でまとめた日本語テキスト",
  "steps": ["実装ステップを具体的に。5〜8件", "..."],
  "claudePrompt": "Claude Code にそのまま貼り付けられる日本語の実装指示。背景・対象ファイル・完了条件を含める",
  "tags": ["英小文字のタグ", "最大5件"]
}`;

export type WorksConsultResult =
  | { ok: true; reply: string; visual: ConsultVisualDocument | null; model: string }
  | { ok: false; reason: string };

export type WorksSummaryResult =
  | { ok: true; draft: WorkNoteDraft; model: string }
  | { ok: false; reason: string };

function trimHistory(history: WorksChatMessage[]): WorksChatMessage[] {
  return history
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
    }));
}

async function trackUsage(
  userId: string,
  feature: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  if (promptTokens === 0 && completionTokens === 0) return;
  await recordTokenUsage({
    userId,
    feature,
    model,
    promptTokens,
    completionTokens,
  });
}

function parseCard(raw: unknown): ConsultVisualCard | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ConsultVisualCard>;
  if (typeof item.title !== "string" || typeof item.body !== "string") return null;
  const tone =
    item.tone === "cyan" ||
    item.tone === "teal" ||
    item.tone === "violet" ||
    item.tone === "amber"
      ? item.tone
      : undefined;
  return {
    title: item.title.slice(0, 24),
    body: item.body.slice(0, 120),
    tone,
  };
}

function parseHighlight(raw: unknown): ConsultVisualHighlight | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ConsultVisualHighlight>;
  if (typeof item.label !== "string" || typeof item.value !== "string") return null;
  return {
    label: item.label.slice(0, 16),
    value: item.value.slice(0, 40),
    caption: typeof item.caption === "string" ? item.caption.slice(0, 60) : undefined,
  };
}

function parseVisual(raw: unknown): ConsultVisualDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ConsultVisualDocument>;
  if (typeof item.title !== "string") return null;

  const layout =
    typeof item.layout === "string" && VALID_LAYOUTS.has(item.layout as ConsultVisualLayout)
      ? (item.layout as ConsultVisualLayout)
      : "cards";

  return {
    title: item.title.slice(0, 40),
    subtitle: typeof item.subtitle === "string" ? item.subtitle.slice(0, 60) : undefined,
    layout,
    labels: Array.isArray(item.labels)
      ? item.labels.filter((l): l is string => typeof l === "string").slice(0, 5).map((l) => l.slice(0, 16))
      : [],
    cards: Array.isArray(item.cards)
      ? item.cards.map(parseCard).filter((c): c is ConsultVisualCard => c !== null).slice(0, 4)
      : [],
    highlights: Array.isArray(item.highlights)
      ? item.highlights
          .map(parseHighlight)
          .filter((h): h is ConsultVisualHighlight => h !== null)
          .slice(0, 3)
      : [],
    bullets: Array.isArray(item.bullets)
      ? item.bullets.filter((b): b is string => typeof b === "string").slice(0, 5).map((b) => b.slice(0, 60))
      : [],
  };
}

function parseConsultResponse(raw: string): { reply: string; visual: ConsultVisualDocument | null } | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as {
      reply?: unknown;
      visual?: unknown;
    };
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
    return {
      reply: parsed.reply.trim().slice(0, MAX_MESSAGE_CHARS),
      visual: parseVisual(parsed.visual),
    };
  } catch {
    return null;
  }
}

export async function sendWorksConsult(
  userId: string,
  message: string,
  history: WorksChatMessage[],
  topicId: string,
): Promise<WorksConsultResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "相談内容を入力してください。" };
  }
  if (trimmed.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      reason: `相談内容が長すぎます（${MAX_MESSAGE_CHARS}文字以内）。`,
    };
  }
  if (!isGeminiConfigured()) {
    return {
      ok: false,
      reason:
        "Gemini が未設定です。Google AI Studio の API キーを GEMINI_API_KEY に設定してください。",
    };
  }

  const topic = resolveWorksTopic(topicId);
  const result = await generateWithGemini({
    system: `${TOPIC_PROMPTS[topic.id]}\n\n${RESPONSE_SCHEMA}`,
    messages: [...trimHistory(history), { role: "user", content: trimmed }],
    maxOutputTokens: 4500,
    temperature: 0.55,
    responseMimeType: "application/json",
  });

  if (!result.ok) return result;

  await trackUsage(
    userId,
    "works-consult",
    result.model,
    result.promptTokens,
    result.completionTokens,
  );

  const parsed = parseConsultResponse(result.text);
  if (!parsed) {
    return {
      ok: true,
      reply: result.text.trim().slice(0, MAX_MESSAGE_CHARS),
      visual: null,
      model: result.model,
    };
  }

  return {
    ok: true,
    reply: parsed.reply,
    visual: parsed.visual ?? emptyConsultVisual(),
    model: result.model,
  };
}

function parseDraft(raw: string): WorkNoteDraft | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Partial<WorkNoteDraft>;
    if (typeof parsed.title !== "string" || typeof parsed.summary !== "string") {
      return null;
    }
    return {
      title: parsed.title.slice(0, 80),
      summary: parsed.summary.slice(0, 2000),
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.filter((s): s is string => typeof s === "string").slice(0, 10)
        : [],
      claudePrompt:
        typeof parsed.claudePrompt === "string"
          ? parsed.claudePrompt.slice(0, 4000)
          : "",
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === "string").slice(0, 5)
        : [],
    };
  } catch {
    return null;
  }
}

export async function summarizeWorksConsult(
  userId: string,
  history: WorksChatMessage[],
  topicId: string,
): Promise<WorksSummaryResult> {
  const messages = trimHistory(history);
  if (messages.length === 0) {
    return { ok: false, reason: "まとめる会話がありません。" };
  }
  if (!isGeminiConfigured()) {
    return { ok: false, reason: "Gemini が未設定のため要約できません。" };
  }

  const topic = resolveWorksTopic(topicId);
  const transcript = messages
    .map((m) => `【${m.role === "user" ? "相談者" : "回答"}】\n${m.content}`)
    .join("\n\n");

  const result = await generateWithGemini({
    system: SUMMARY_PROMPT,
    messages: [
      {
        role: "user",
        content: `相談テーマ: ${topic.label}\n\n${transcript}`,
      },
    ],
    maxOutputTokens: 3000,
    temperature: 0.3,
    responseMimeType: "application/json",
  });

  if (!result.ok) return result;

  await trackUsage(
    userId,
    "works-summary",
    result.model,
    result.promptTokens,
    result.completionTokens,
  );

  const draft = parseDraft(result.text);
  if (!draft) {
    return { ok: false, reason: "まとめの生成に失敗しました。もう一度お試しください。" };
  }

  return { ok: true, draft, model: result.model };
}
