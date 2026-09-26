import {
  resolveUsjCharacter,
  type UsjCharacterId,
} from "@/lib/usj-characters";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { buildUsjAdvice } from "@/lib/server/usj-analysis";
import { clampHistory, sanitizeText } from "@/lib/server/security";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import type { DisneyChatMessage } from "@/lib/types/disney";

function trimHistory(history: DisneyChatMessage[]): DisneyChatMessage[] {
  return clampHistory(history, 4);
}

async function buildParkContext(date?: string): Promise<string> {
  const advice = await buildUsjAdvice(date);
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
    lines.push(
      "主要アトラクション:",
      ...advice.touringPlan.slice(0, 5).map(
        (item) =>
          `- ${item.attraction.nameJa ?? item.attraction.name}: ${item.attraction.waitTime ?? "—"}分`,
      ),
    );
  }
  return lines.join("\n");
}

export type UsjChatResult =
  | { ok: true; reply: string; model: string; character: UsjCharacterId }
  | { ok: false; reason: string };

export async function sendUsjChat(
  userId: string,
  message: string,
  history: DisneyChatMessage[] = [],
  date?: string,
  characterId?: string,
): Promise<UsjChatResult> {
  const trimmed = sanitizeText(message, 600);
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }
  if (!isAzureOpenAiConfigured()) {
    return { ok: false, reason: "チャット用 AI が未設定です。" };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const character = resolveUsjCharacter(characterId);
  const context = await buildParkContext(date);
  const client = getAzureOpenAiClient();
  const deployment = getAzureOpenAiDeployment();
  const recent = trimHistory(history);

  try {
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 700,
      messages: [
        {
          role: "system",
          content: `${character.systemPrompt}\n\n【本日の園データ】\n${context}`,
        },
        ...recent.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: trimmed },
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return { ok: false, reason: "応答が空でした。" };
    }
    await recordTokenUsage({
      userId,
      feature: "usj-chat",
      model: completion.model ?? defaultStockAiModel(),
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      requestId: completion.id,
    });
    return {
      ok: true,
      reply,
      model: completion.model ?? deployment,
      character: character.id,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "チャットに失敗しました",
    };
  }
}
