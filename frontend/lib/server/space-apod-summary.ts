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
import type { ApodEntry } from "@/lib/types/space";

const SYSTEM_PROMPT = `あなたは天文学の解説者です。NASA APOD（天文写真）の英語解説を、日本語で分かりやすく書き直します。

## 出力形式（厳守）
JSON のみ:
{
  "titleJa": "日本語タイトル",
  "explanationJa": "日本語解説（400〜700文字。です・ます調）"
}

## ルール
- 専門用語は必要に応じて短い補足を括弧で
- 天体名はカタカナまたは一般的中文表記
- 観測波長・構成成分・距離があれば含める
- 捏造しない`;

export type ApodSummaryResult =
  | { ok: true; titleJa: string; explanationJa: string; model: string }
  | { ok: false; reason: string };

export async function summarizeApodInJapanese(
  userId: string,
  apod: ApodEntry,
): Promise<ApodSummaryResult> {
  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、日本語解説は利用できません。",
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

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `タイトル: ${apod.title}\n日付: ${apod.date}\n\n英語解説:\n${apod.explanation}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, reason: "日本語解説を生成できませんでした。" };
    }

    let parsed: { titleJa?: string; explanationJa?: string };
    try {
      parsed = JSON.parse(raw) as { titleJa?: string; explanationJa?: string };
    } catch {
      return { ok: false, reason: "日本語解説の形式が不正です。" };
    }

    const titleJa = String(parsed.titleJa ?? apod.title).trim();
    const explanationJa = String(parsed.explanationJa ?? "").trim();
    if (!explanationJa) {
      return { ok: false, reason: "日本語解説が空です。" };
    }

    const modelUsed = completion.model ?? model;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "space-apod-ja",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return { ok: true, titleJa, explanationJa, model: modelUsed };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `日本語解説に失敗しました: ${error.message}`
          : "日本語解説に失敗しました",
    };
  }
}
