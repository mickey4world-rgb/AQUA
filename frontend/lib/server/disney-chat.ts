import {
  resolveDisneyCharacter,
  type DisneyCharacterId,
} from "@/lib/disney-characters";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { buildDisneyAdvice } from "@/lib/server/disney-analysis";
import { clampHistory, sanitizeText } from "@/lib/server/security";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import type { DisneyParkKey, DisneyChatMessage } from "@/lib/types/disney";

export type { DisneyChatMessage };

function trimHistory(history: DisneyChatMessage[]): DisneyChatMessage[] {
  return clampHistory(history, 4);
}

async function buildParkContext(
  park: DisneyParkKey,
  date?: string,
): Promise<string> {
  const advice = await buildDisneyAdvice(park, date);
  const isForecast = advice.prediction?.mode === "forecast";

  const lines = [
    `パーク: ${advice.parkName}`,
    `対象日: ${advice.targetDate ?? "本日"}`,
    `混雑: ${crowdLevelLabels[advice.crowdLevel]}`,
    `概要: ${advice.summary.slice(0, 200)}`,
  ];

  if (isForecast && advice.prediction) {
    lines.push(
      `予測待ち: 約${advice.prediction.estimatedWait}分`,
      `要因: ${advice.prediction.factors.slice(0, 3).join("、")}`,
    );
  }

  if (!isForecast && advice.touringPlan.length) {
    const top = advice.touringPlan.slice(0, 5);
    lines.push(
      "主要アトラクション:",
      ...top.map(
        (item) =>
          `- ${item.attraction.nameJa ?? item.attraction.name}: ${item.attraction.waitTime ?? "—"}分`,
      ),
    );
  }

  return lines.join("\n");
}

export type DisneyChatResult =
  | { ok: true; reply: string; model: string; character: DisneyCharacterId }
  | { ok: false; reason: string };

export async function sendDisneyChat(
  userId: string,
  park: DisneyParkKey,
  message: string,
  history: DisneyChatMessage[] = [],
  date?: string,
  characterId?: string,
): Promise<DisneyChatResult> {
  const trimmed = sanitizeText(message, 600);
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、チャットは利用できません。",
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const character = resolveDisneyCharacter(characterId);
  const context = await buildParkContext(park, date);
  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: character.systemPrompt },
    {
      role: "system",
      content: `【参考データ】\n${context}`,
    },
    ...trimHistory(history).map((m) => ({
      role: m.role as "user" | "assistant",
      content: sanitizeText(m.content, 800),
    })),
    { role: "user", content: trimmed },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 450,
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
        feature: "disney-chat",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return { ok: true, reply, model: modelUsed, character: character.id };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `チャットに失敗しました: ${error.message}`
          : "チャットに失敗しました",
    };
  }
}
