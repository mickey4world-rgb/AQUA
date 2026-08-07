import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import type { ApodAnalysis, ApodEntry, SpaceChatMessage } from "@/lib/types/space";

const SYSTEM_PROMPT = `あなたは天体物理・宇宙望遠鏡の専門アシスタントです。
NASA APOD（天文写真）の画像について、日本語で分かりやすく答えます。

## 回答方針
- 星雲・銀河などの**構成成分**（水素・ヘリウム・塵・分子など）を具体的に
- 観測波長（可視光・赤外・X線等）と、それぞれが何を示すかを説明
- 不確かな情報は「可能性が高い」「推定」と明示。捏造しない
- 400〜700文字程度。箇条書き可
- です・ます調`;

function trimHistory(history: SpaceChatMessage[]): SpaceChatMessage[] {
  return history.slice(-6);
}

function buildContext(apod: ApodEntry, analysis: ApodAnalysis): string {
  const bands = analysis.bands
    .filter((b) => b.detected)
    .map((b) => `${b.label}(${b.range})`)
    .join(", ");

  return `【画像タイトル】${apod.title}
【日付】${apod.date}
【天体タイプ】${analysis.objectType ?? "不明"}
【望遠鏡】${analysis.telescope ?? "不明"}
【検出波長帯】${bands || "可視光（推定）"}
【NASA 解説（抜粋）】
${apod.explanation.slice(0, 1200)}`;
}

export type SpaceChatResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; reason: string };

export async function sendSpaceChat(
  userId: string,
  message: string,
  apod: ApodEntry,
  analysis: ApodAnalysis,
  history: SpaceChatMessage[] = [],
): Promise<SpaceChatResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "質問を入力してください。" };
  }
  if (trimmed.length > 600) {
    return { ok: false, reason: "質問が長すぎます（600文字以内）。" };
  }

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、AI 解説は利用できません。",
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();
  const context = buildContext(apod, analysis);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: context },
    ...trimHistory(history).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: trimmed },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 500,
      messages,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return { ok: false, reason: "AI から応答がありませんでした。" };
    }

    const modelUsed = completion.model ?? model;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "space-chat",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return { ok: true, reply, model: modelUsed };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `AI 解説に失敗しました: ${error.message}`
          : "AI 解説に失敗しました",
    };
  }
}
