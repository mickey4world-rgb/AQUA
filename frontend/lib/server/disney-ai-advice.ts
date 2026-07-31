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
import { crowdLevelLabels } from "@/lib/disney-utils";
import type { DisneyAdvice, DisneyAiInsight } from "@/lib/types/disney";

type AiPayload = {
  headline: string;
  commentary: string;
  recommendedRoute: string[];
  timingTips: string[];
  crowdStrategy: string;
  confidence: "high" | "medium" | "low";
};

function buildPrompt(advice: DisneyAdvice): string {
  const topWaits = advice.touringPlan
    .slice(0, 8)
    .map(
      (item) =>
        `- ${item.attraction.nameJa ?? item.attraction.name}: ${item.attraction.waitTime ?? "—"}分 (${item.priority})`,
    )
    .join("\n");

  return [
    "あなたは東京ディズニーリゾートの来園アドバイザーです。",
    "JSONのみを返してください。日本語で、実用的な回り方を提案してください。",
    "",
    `パーク: ${advice.parkName}`,
    `混雑: ${crowdLevelLabels[advice.crowdLevel]}`,
    advice.summary,
    "",
    "時間帯アドバイス:",
    advice.timeAdvice.map((line) => `- ${line}`).join("\n"),
    "",
    "時期アドバイス:",
    advice.seasonalAdvice.map((line) => `- ${line}`).join("\n"),
    "",
    "主要アトラクション待ち時間:",
    topWaits,
    "",
    "出力JSON:",
    "{",
    '  "headline": "30文字以内",',
    '  "commentary": "200〜350文字の解説",',
    '  "recommendedRoute": ["ステップ1", "ステップ2", "ステップ3"],',
    '  "timingTips": ["タイミングのコツ1", "コツ2"],',
    '  "crowdStrategy": "混雑時の戦略を1段落",',
    '  "confidence": "high|medium|low"',
    "}",
  ].join("\n");
}

function parsePayload(content: string): AiPayload {
  const parsed = JSON.parse(content) as Partial<AiPayload>;
  if (!parsed.headline || !parsed.commentary || !parsed.crowdStrategy) {
    throw new Error("Invalid AI payload");
  }
  return {
    headline: parsed.headline,
    commentary: parsed.commentary,
    recommendedRoute: parsed.recommendedRoute ?? [],
    timingTips: parsed.timingTips ?? [],
    crowdStrategy: parsed.crowdStrategy,
    confidence: parsed.confidence ?? "medium",
  };
}

export async function enhanceDisneyAdviceWithAi(
  advice: DisneyAdvice,
  userId: string,
): Promise<DisneyAdvice> {
  if (!isAzureOpenAiConfigured()) {
    return {
      ...advice,
      aiInsight: {
        available: false,
        reason: "Azure OpenAI が未設定のため、AI アドバイスは利用できません。",
      },
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ...advice,
      aiInsight: {
        available: false,
        reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
      },
    };
  }

  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Respond in Japanese JSON only.",
        },
        { role: "user", content: buildPrompt(advice) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const payload = parsePayload(content);
    const modelUsed = completion.model ?? model;

    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "disney-suggest",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    const aiInsight: DisneyAiInsight = {
      available: true,
      model: modelUsed,
      headline: payload.headline,
      commentary: payload.commentary,
      recommendedRoute: payload.recommendedRoute,
      timingTips: payload.timingTips,
      crowdStrategy: payload.crowdStrategy,
      confidence: payload.confidence,
      generatedAt: new Date().toISOString(),
    };

    return { ...advice, aiInsight };
  } catch (error) {
    return {
      ...advice,
      aiInsight: {
        available: false,
        reason:
          error instanceof Error
            ? `AI アドバイスに失敗しました: ${error.message}`
            : "AI アドバイスに失敗しました",
      },
    };
  }
}
