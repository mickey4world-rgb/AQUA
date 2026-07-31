import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { formatPrice } from "@/lib/stock-utils";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import type { AiStockInsight, StockAdvice, StockWatch } from "@/lib/types/stock";

const actionLabels = {
  hold: "保有継続",
  buy: "買い検討",
  sell: "売り検討",
  watch: "様子見",
};

type AiResponsePayload = {
  headline: string;
  commentary: string;
  actionRationale: string;
  risks: string[];
  catalysts: string[];
  confidence: "high" | "medium" | "low";
};

function buildPrompt(watch: StockWatch, advice: StockAdvice): string {
  const market = watch.market ?? "us";
  const newsLines = advice.priceChangeContext
    .slice(0, 5)
    .map((item) => `- ${item.title}${item.source ? ` (${item.source})` : ""}`)
    .join("\n");

  return [
    "あなたは個人投資家向けのアドバイザーです。",
    "投資助言業ではないため、断定調を避け、最終判断はユーザーに委ねる表現にしてください。",
    "JSONのみを返してください。",
    "",
    "銘柄情報:",
    `- 名称: ${watch.name ?? advice.companyName ?? watch.ticker}`,
    `- ティッカー: ${watch.ticker}`,
    `- 市場: ${market === "jp" ? "日本株" : "米国株"}`,
    `- 購入価格: ${formatPrice(watch.buyPrice, market)}`,
    `- 目標株価: ${formatPrice(watch.targetPrice, market)}`,
    `- 保有株数: ${watch.shares}`,
    watch.memo ? `- メモ: ${watch.memo}` : "",
    "",
    "テクニカル分析:",
    `- 現在株価: ${formatPrice(advice.currentPrice, market)}`,
    `- 前日比: ${advice.changePct.toFixed(2)}%`,
    `- MA5: ${formatPrice(advice.ma5, market)}`,
    `- MA25: ${formatPrice(advice.ma25, market)}`,
    `- トレンド: ${advice.trend === "bullish" ? "上昇" : "下降"}`,
    `- 損益率: ${advice.profitPct.toFixed(1)}%`,
    `- システム判定: ${actionLabels[advice.action]}`,
    `- 判定理由: ${advice.reasons.join(" / ")}`,
    "",
    "最近のニュース・イベント:",
    newsLines || "- 該当なし",
    "",
    "出力JSONスキーマ:",
    "{",
    '  "headline": "30文字以内の見出し",',
    '  "commentary": "200〜400文字の日本語解説。ニュースとテクニカルを統合。",',
    '  "actionRationale": "システム判定に対する補足理由",',
    '  "risks": ["リスク1", "リスク2"],',
    '  "catalysts": ["今後の材料1"],',
    '  "confidence": "high|medium|low"',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseAiResponse(content: string): AiResponsePayload {
  const parsed = JSON.parse(content) as Partial<AiResponsePayload>;

  if (!parsed.headline || !parsed.commentary || !parsed.actionRationale) {
    throw new Error("AI response is missing required fields");
  }

  return {
    headline: parsed.headline,
    commentary: parsed.commentary,
    actionRationale: parsed.actionRationale,
    risks: parsed.risks?.filter(Boolean) ?? [],
    catalysts: parsed.catalysts?.filter(Boolean) ?? [],
    confidence: parsed.confidence ?? "medium",
  };
}

export async function enhanceStockAdviceWithAi(
  watch: StockWatch,
  advice: StockAdvice,
  userId: string,
): Promise<StockAdvice> {
  if (!isAzureOpenAiConfigured()) {
    return {
      ...advice,
      aiInsight: {
        available: false,
        reason: "Azure OpenAI が未設定のため、AI 分析は利用できません。",
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
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a bilingual financial assistant. Respond in Japanese JSON only.",
        },
        {
          role: "user",
          content: buildPrompt(watch, advice),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty AI response");
    }

    const payload = parseAiResponse(content);
    const usage = completion.usage;

    if (usage) {
      await recordTokenUsage({
        userId,
        feature: "stock-analysis",
        model,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return {
      ...advice,
      aiInsight: {
        available: true,
        model,
        headline: payload.headline,
        commentary: payload.commentary,
        actionRationale: payload.actionRationale,
        risks: payload.risks,
        catalysts: payload.catalysts,
        confidence: payload.confidence,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ...advice,
      aiInsight: {
        available: false,
        reason:
          error instanceof Error
            ? `AI 分析に失敗しました: ${error.message}`
            : "AI 分析に失敗しました",
      },
    };
  }
}
