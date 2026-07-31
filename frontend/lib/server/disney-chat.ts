import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { buildDisneyAdvice } from "@/lib/server/disney-analysis";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import type { DisneyParkKey, DisneyChatMessage } from "@/lib/types/disney";

export type { DisneyChatMessage };

const MICKEY_SYSTEM_PROMPT = `あなたは「ミッキー」、Mickey さん専属の東京ディズニーリゾート（TDR）アドバイザーです。

話し方:
- 明るく親しみやすい口調（です・ます調）。たまに「！」でテンションを出す
- PM 兼パーク好きの兄さん／姉さん感。上から目線にならない
- 絵文字は 0〜2 個まで（✨ 🎢 程度）。多用しない
- 1回答は 250〜450 文字程度。箇条書きは 3〜5 点まで

ルール:
- 添付コンテキストの待ち時間・混雑データを優先。数字を捏造しない
- データがない項目は「今のデータでは〜」と正直に言う
- ショー時間・運休・天候など不明な点は推測せず、確認を促す
- 来園者の質問に直接答える。関係ない長文は避ける`;

function trimHistory(history: DisneyChatMessage[]): DisneyChatMessage[] {
  return history.slice(-8);
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
    `概要: ${advice.summary}`,
  ];

  if (isForecast && advice.prediction) {
    lines.push(
      `予測平均待ち: 約${advice.prediction.estimatedWait}分`,
      `予測要因: ${advice.prediction.factors.join("、")}`,
    );
  }

  if (advice.timeAdvice.length) {
    lines.push("時間帯の傾向:", ...advice.timeAdvice.map((t) => `- ${t}`));
  }

  if (!isForecast && advice.touringPlan.length) {
    const top = advice.touringPlan.slice(0, 8);
    lines.push(
      "主要アトラクション（参考）:",
      ...top.map(
        (item) =>
          `- ${item.attraction.nameJa ?? item.attraction.name}: ${item.attraction.waitTime ?? "—"}分 (${item.priority})`,
      ),
    );
  }

  return lines.join("\n");
}

export type DisneyChatResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; reason: string };

export async function sendDisneyChat(
  userId: string,
  park: DisneyParkKey,
  message: string,
  history: DisneyChatMessage[] = [],
  date?: string,
): Promise<DisneyChatResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }
  if (trimmed.length > 800) {
    return { ok: false, reason: "メッセージが長すぎます（800文字以内）。" };
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

  const context = await buildParkContext(park, date);
  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: MICKEY_SYSTEM_PROMPT },
    {
      role: "system",
      content: `【現在のパーク状況（参考データ）】\n${context}`,
    },
    ...trimHistory(history).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: trimmed },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 700,
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

    return { ok: true, reply, model: modelUsed };
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
