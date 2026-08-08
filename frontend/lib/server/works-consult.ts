import {
  generateWithGemini,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import { recordTokenUsage } from "@/lib/server/token-usage";
import {
  resolveWorksTopic,
  type WorkNoteDraft,
  type WorksChatMessage,
  type WorksTopicId,
} from "@/lib/types/works";

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;

const BASE_PERSONA = `あなたは IT / AI / クラウド開発に精通したシニアエンジニア兼テックリードです。
相談者はプロダクトマネージャーで、自分でコードを書きながら試行錯誤するタイプです。

## 回答方針
- 日本語・です/ます調
- 結論を最初の2〜3行で述べてから根拠を書く
- 選択肢が複数あるときはトレードオフを明示し、推奨を1つ選ぶ
- 具体的なコード例・コマンド・ファイルパスを惜しまず書く
- 不確かな情報は「未確認」と明示し、断定しない
- 800〜1400文字程度。見出しと箇条書きを使い、読みやすく`;

const TOPIC_PROMPTS: Record<WorksTopicId, string> = {
  "claude-code": `${BASE_PERSONA}

## このスレッドの前提
相談者は「AQUA Personal Apps」という個人向け統合ポータルを Claude Code で開発しています。
技術構成: Next.js 16 (App Router) / TypeScript / Tailwind CSS v4 / Azure Static Web Apps / Azure Cosmos DB / Azure OpenAI / Gemini。
回答は Claude Code にそのまま指示できる粒度まで具体化してください。変更対象のファイルと処理の流れを示すこと。`,

  architecture: `${BASE_PERSONA}

## このスレッドの前提
Next.js / Azure / Cosmos DB を中心とした設計・インフラの相談です。
コスト、運用負荷、スケール、セキュリティの4観点で必ず触れてください。`,

  ai: `${BASE_PERSONA}

## このスレッドの前提
AI 活用（モデル選定・プロンプト設計・トークンコスト最適化）の相談です。
無料枠や安価なモデルで代替できる場合は必ず提案してください。`,

  general: `${BASE_PERSONA}

## このスレッドの前提
IT 全般の技術相談です。前提知識を補いながら、実際に手を動かせる順序で説明してください。`,
};

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
  | { ok: true; reply: string; model: string }
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

/**
 * Gemini 無料枠を使うため Azure の月次トークン上限では止めない。
 * 使用量はコストダッシュボード可視化のために 0 円で記録する。
 */
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
    system: TOPIC_PROMPTS[topic.id],
    messages: [...trimHistory(history), { role: "user", content: trimmed }],
    maxOutputTokens: 1600,
    temperature: 0.65,
  });

  if (!result.ok) return result;

  await trackUsage(
    userId,
    "works-consult",
    result.model,
    result.promptTokens,
    result.completionTokens,
  );

  return { ok: true, reply: result.text, model: result.model };
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
    maxOutputTokens: 2000,
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
