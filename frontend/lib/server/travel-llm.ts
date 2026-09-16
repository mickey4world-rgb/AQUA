/**
 * Travel 向け JSON 生成
 * - 主経路: 安価 Azure OpenAI（Gemini 無料枠のレート制限で止まりやすいため）
 * - 副経路: Gemini
 * - nano / GPT-5 系は temperature 非対応 → 送らない（失敗時は除去して再試行）
 */
import {
  getAzureOpenAiCheapDeployment,
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  generateWithGemini,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";

export type TravelLlmProvider = "gemini" | "openai";

export type TravelLlmResult =
  | { ok: true; text: string; provider: TravelLlmProvider; model: string }
  | { ok: false; reason: string };

/** temperature を変えられない／送ると 400 になるデプロイ */
function isFixedTemperatureModel(deployment: string): boolean {
  return /nano|aqua-cheap|gpt-5|gpt5|o1|o3|o4|reason/i.test(deployment);
}

function openaiDeploymentsToTry(): string[] {
  const list = [
    getAzureOpenAiCheapDeployment(),
    process.env.AZURE_OPENAI_DEPLOYMENT_FAST?.trim(),
    process.env.SOLUNA_OPENAI_DEPLOYMENT_FAST?.trim(),
    getAzureOpenAiDeployment(),
  ].filter((v): v is string => Boolean(v && v.trim()));
  return [...new Set(list)];
}

async function callOpenAiJson(input: {
  deployment: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}): Promise<TravelLlmResult> {
  const client = getAzureOpenAiClient(input.deployment, "global");
  const locked = isFixedTemperatureModel(input.deployment);

  const buildBody = (includeTemp: boolean) => {
    const body: {
      model: string;
      max_completion_tokens: number;
      response_format: { type: "json_object" };
      messages: Array<{ role: "system" | "user"; content: string }>;
      temperature?: number;
    } = {
      model: input.deployment,
      max_completion_tokens: input.maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    };
    if (includeTemp && input.temperature != null && !locked) {
      body.temperature = input.temperature;
    }
    return body;
  };

  try {
    let completion = await client.chat.completions.create(buildBody(true));
    let text = completion.choices[0]?.message?.content?.trim() ?? "";

    // 一部モデルは content 空で reasoning のみ → 再試行は別デプロイに任せる
    if (!text) {
      return { ok: false, reason: `${input.deployment}: 空の応答` };
    }
    return {
      ok: true,
      text,
      provider: "openai",
      model: completion.model ?? input.deployment,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/temperature/i.test(message) && /unsupported|does not support|only the default/i.test(message)) {
      try {
        const completion = await client.chat.completions.create(buildBody(false));
        const text = completion.choices[0]?.message?.content?.trim() ?? "";
        if (!text) {
          return { ok: false, reason: `${input.deployment}: 空の応答（temperature 除去後）` };
        }
        return {
          ok: true,
          text,
          provider: "openai",
          model: completion.model ?? input.deployment,
        };
      } catch (retryError) {
        return {
          ok: false,
          reason:
            retryError instanceof Error
              ? `OpenAI(${input.deployment}): ${retryError.message}`
              : `OpenAI(${input.deployment}) 再試行失敗`,
        };
      }
    }
    return {
      ok: false,
      reason: `OpenAI(${input.deployment}): ${message}`,
    };
  }
}

async function generateWithOpenAiCascade(input: {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}): Promise<TravelLlmResult> {
  if (!isAzureOpenAiConfigured()) {
    return { ok: false, reason: "Azure OpenAI が未設定です" };
  }
  const reasons: string[] = [];
  for (const deployment of openaiDeploymentsToTry()) {
    const result = await callOpenAiJson({
      deployment,
      system: input.system,
      user: input.user,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
    });
    if (result.ok) return result;
    reasons.push(result.reason);
  }
  return {
    ok: false,
    reason: reasons.join(" → ") || "Azure OpenAI に失敗しました",
  };
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

  // 1) OpenAI を先に（無料 Gemini のレート制限でアプリが止まるのを防ぐ）
  if (isAzureOpenAiConfigured()) {
    const openai = await generateWithOpenAiCascade({
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

  // 2) Gemini
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
  } else {
    reasons.push("Gemini: 未設定");
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
