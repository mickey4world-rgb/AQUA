/**
 * Travel 向け JSON 生成: Gemini 優先 → 失敗時は安価 Azure OpenAI
 */
import {
  getAzureOpenAiCheapDeployment,
  getAzureOpenAiClient,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  generateWithGemini,
  isGeminiConfigured,
  isRetryableGeminiReason,
  stripJsonFence,
} from "@/lib/server/gemini";

export type TravelLlmProvider = "gemini" | "openai";

export type TravelLlmResult =
  | { ok: true; text: string; provider: TravelLlmProvider; model: string }
  | { ok: false; reason: string };

async function generateWithCheapOpenAi(input: {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
}): Promise<TravelLlmResult> {
  if (!isAzureOpenAiConfigured()) {
    return { ok: false, reason: "Azure OpenAI が未設定です" };
  }
  const deployment = getAzureOpenAiCheapDeployment();
  try {
    const client = getAzureOpenAiClient(deployment, "global");
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: input.maxOutputTokens,
      temperature: input.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, reason: "OpenAI から空の応答でした" };
    }
    return {
      ok: true,
      text,
      provider: "openai",
      model: completion.model ?? deployment,
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `OpenAI 失敗: ${error.message}`
          : "OpenAI への接続に失敗しました",
    };
  }
}

export async function generateTravelJson(input: {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<TravelLlmResult> {
  const maxOutputTokens = input.maxOutputTokens ?? 3000;
  const temperature = input.temperature ?? 0.2;
  const reasons: string[] = [];

  if (isGeminiConfigured()) {
    const gemini = await generateWithGemini({
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      maxOutputTokens,
      temperature,
      responseMimeType: "application/json",
    });
    if (gemini.ok) {
      return {
        ok: true,
        text: gemini.text,
        provider: "gemini",
        model: gemini.model,
      };
    }
    reasons.push(`Gemini: ${gemini.reason}`);
    // 未設定以外は安価 OpenAI へ（混雑・地域・無料枠切れ含む）
    if (!isRetryableGeminiReason(gemini.reason) && /未設定/.test(gemini.reason)) {
      // fall through only if OpenAI available; still try OpenAI below
    }
  } else {
    reasons.push("Gemini: 未設定");
  }

  if (isAzureOpenAiConfigured()) {
    const openai = await generateWithCheapOpenAi({
      system: input.system,
      user: input.user,
      maxOutputTokens,
      temperature,
    });
    if (openai.ok) return openai;
    reasons.push(openai.reason);
  } else {
    reasons.push("Azure OpenAI: 未設定");
  }

  return {
    ok: false,
    reason: `資料解析エンジンを起動できません（${reasons.join(" / ")}）`,
  };
}

export function parseTravelJsonText<T>(text: string): T {
  return JSON.parse(stripJsonFence(text)) as T;
}

export function isTravelLlmConfigured(): boolean {
  return isGeminiConfigured() || isAzureOpenAiConfigured();
}
