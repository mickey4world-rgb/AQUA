/**
 * Google AI Studio (Gemini) の無料枠を利用する薄いクライアント。
 * SDK を足さず fetch のみで呼ぶ。課金 API（Vertex AI）は使わない。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** 思考モデル。maxOutputTokens には思考分（1000〜1500程度）を上乗せして渡すこと。 */
const DEFAULT_MODEL = "gemini-flash-latest";
const DEFAULT_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-flash-latest"];
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_GEMINI_ATTEMPTS = 3;

/**
 * Static Web Apps は East Asia でしか動かせず、Google はその地域からの呼び出しを
 * "User location is not supported for the API use." で拒否する。
 * Japan East に置いた中継 Functions を挟むことで無料枠のまま利用する。
 */
function getRelay(): { url: string; key: string } | null {
  const url = process.env.GEMINI_RELAY_URL?.trim();
  const key = process.env.GEMINI_RELAY_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) || getRelay() !== null;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function getGeminiModelCandidates(preferred?: string): string[] {
  const primary = preferred?.trim() || getGeminiModel();
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableGeminiFailure(status: number, message?: string): boolean {
  const msg = (message ?? "").toLowerCase();
  if (status === 429 || status === 503 || status === 500 || status === 502) return true;
  return (
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("resource exhausted") ||
    msg.includes("try again later")
  );
}

export function isRetryableGeminiReason(reason: string): boolean {
  const msg = reason.toLowerCase();
  return (
    msg.includes("混雑") ||
    msg.includes("high demand") ||
    msg.includes("レート上限") ||
    msg.includes("try again") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("タイムアウト")
  );
}

export type GeminiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GeminiRequest = {
  system: string;
  messages: GeminiMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** "application/json" を指定すると JSON のみを返させる */
  responseMimeType?: "text/plain" | "application/json";
};

export type GeminiResult =
  | {
      ok: true;
      text: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      finishReason?: string;
    }
  | { ok: false; reason: string };

type GeminiApiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string; status?: string };
};

function failureReason(
  status: number,
  body: GeminiApiResponse,
  model: string,
): string {
  if (status === 429) {
    // limit: 0 はレート超過ではなく、そのモデルに無料枠が割り当てられていない状態
    if (body.error?.message?.includes("limit: 0")) {
      return `${model} はこの Google プロジェクトの無料枠対象外です。GEMINI_MODEL に無料枠のあるモデル（例: gemini-flash-latest）を指定してください。`;
    }
    if (body.error?.message?.toLowerCase().includes("high demand")) {
      return "Gemini が混雑しています。しばらく待ってから再度お試しください。";
    }
    return "Gemini 無料枠のレート上限に達しました。1分ほど待ってから再度お試しください。";
  }
  if (status === 503 || body.error?.message?.toLowerCase().includes("high demand")) {
    return "Gemini が混雑しています。自動で再試行しましたが応答できませんでした。";
  }
  if (status === 400 && body.error?.message?.includes("API key")) {
    return "GEMINI_API_KEY が正しくありません。Google AI Studio のキーを確認してください。";
  }
  if (status === 403) {
    return "Gemini API へのアクセスが拒否されました。API キーの権限を確認してください。";
  }
  if (body.error?.message?.includes("User location is not supported")) {
    return "この配信リージョンからは Gemini を利用できません。Japan East の中継 Functions を GEMINI_RELAY_URL / GEMINI_RELAY_KEY に設定してください。";
  }
  return body.error?.message
    ? `Gemini API エラー: ${body.error.message}`
    : `Gemini API エラー（HTTP ${status}）`;
}

export type GeminiRequestOptions = {
  /** 試行するモデル順（未指定時は GEMINI_MODEL + フォールバック） */
  models?: string[];
  /** 未指定時は 45 秒 */
  timeoutMs?: number;
  /** 未指定時は 3 */
  maxAttempts?: number;
};

async function generateWithGeminiOnce(
  model: string,
  request: GeminiRequest,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<
  | ({
      ok: true;
      text: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      finishReason?: string;
    })
  | { ok: false; reason: string; retryable: boolean }
> {
  const relay = getRelay();
  const apiKey = process.env.GEMINI_API_KEY;

  const payload = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxOutputTokens ?? 3000,
      ...(request.responseMimeType
        ? { responseMimeType: request.responseMimeType }
        : {}),
    },
  };

  const target: { url: string; headers: Record<string, string>; body: string } =
    relay
      ? {
          url: relay.url,
          headers: {
            "Content-Type": "application/json",
            "x-functions-key": relay.key,
          },
          body: JSON.stringify({ model, body: payload }),
        }
      : {
          url: `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey as string,
          },
          body: JSON.stringify(payload),
        };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: target.headers,
      signal: controller.signal,
      body: target.body,
    });

    const body = (await response.json()) as GeminiApiResponse;

    if (!response.ok) {
      const reason = failureReason(response.status, body, model);
      return {
        ok: false,
        reason,
        retryable: isRetryableGeminiFailure(response.status, body.error?.message),
      };
    }

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    const finishReason = body.candidates?.[0]?.finishReason;

    if (!text) {
      const truncated = finishReason === "MAX_TOKENS";
      return {
        ok: false,
        reason: truncated
          ? "回答が長くなりすぎて生成が打ち切られました。相談内容を短く区切って送ってください。"
          : "Gemini から応答がありませんでした。",
        retryable: truncated,
      };
    }

    return {
      ok: true,
      text,
      model,
      promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      finishReason,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "Gemini への接続がタイムアウトしました。", retryable: true };
    }
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Gemini への接続に失敗しました: ${error.message}`
          : "Gemini への接続に失敗しました",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateWithGemini(
  request: GeminiRequest,
  options?: GeminiRequestOptions,
): Promise<GeminiResult> {
  const relay = getRelay();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!relay && !apiKey) {
    return {
      ok: false,
      reason:
        "Gemini が未設定です。Google AI Studio で発行した GEMINI_API_KEY を環境変数に設定してください。",
    };
  }

  const models = options?.models ?? getGeminiModelCandidates();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAttempts = options?.maxAttempts ?? MAX_GEMINI_ATTEMPTS;
  let lastReason = "Gemini から応答がありませんでした。";

  for (const model of models) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const result = await generateWithGeminiOnce(model, request, timeoutMs);
      if (result.ok) return result;

      lastReason = result.reason;
      if (!result.retryable) break;
      if (attempt < maxAttempts - 1) {
        await sleep(900 * (attempt + 1));
      }
    }
  }

  return { ok: false, reason: lastReason };
}

const GEMINI_IMAGE_MODEL_DEFAULTS = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
];
const GEMINI_IMAGE_TIMEOUT_MS = 90_000;

export type GeminiImageReference = {
  mimeType: string;
  data: string;
};

export type GeminiImageRequest = {
  prompt: string;
  referenceImage?: GeminiImageReference;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
};

export type GeminiImageResult =
  | { ok: true; dataUrl: string; mimeType: string; model: string }
  | { ok: false; reason: string };

type GeminiImageApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

function getGeminiImageModelCandidates(): string[] {
  const preferred = process.env.SOLUNA_IMAGE_GEMINI_MODEL?.trim();
  const fallbacks = (process.env.SOLUNA_IMAGE_GEMINI_FALLBACK_MODELS ?? GEMINI_IMAGE_MODEL_DEFAULTS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...(preferred ? [preferred] : []), ...fallbacks])];
}

function extractInlineImage(
  body: GeminiImageApiResponse,
): { mimeType: string; data: string } | null {
  for (const part of body.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData ?? part.inline_data;
    if (!inline?.data) continue;
    const mimeType = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
    return { mimeType, data: inline.data };
  }
  return null;
}

/**
 * Google AI Studio / 検索 AI モードと同系統の Gemini ネイティブ画像生成（Nano Banana 2）。
 */
export async function generateGeminiImage(
  request: GeminiImageRequest,
): Promise<GeminiImageResult> {
  const relay = getRelay();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!relay && !apiKey) {
    return {
      ok: false,
      reason: "Gemini が未設定です。GEMINI_API_KEY または GEMINI_RELAY を設定してください。",
    };
  }

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  parts.push({ text: request.prompt });
  if (request.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: request.referenceImage.mimeType,
        data: request.referenceImage.data,
      },
    });
  }

  const models = getGeminiImageModelCandidates();
  let lastReason = "Gemini 画像生成に失敗しました。";

  for (const model of models) {
    const imageConfig: { aspectRatio: string; imageSize?: string } = {
      aspectRatio: request.aspectRatio ?? "1:1",
    };
    if (model.includes("3.1")) {
      imageConfig.imageSize = "2K";
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        // IMAGE のみだと失敗するケースがあるため TEXT も含める
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig,
      },
    };
    const target: { url: string; headers: Record<string, string>; body: string } = relay
      ? {
          url: relay.url,
          headers: {
            "Content-Type": "application/json",
            "x-functions-key": relay.key,
          },
          body: JSON.stringify({ model, body: payload }),
        }
      : {
          url: `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey as string,
          },
          body: JSON.stringify(payload),
        };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_IMAGE_TIMEOUT_MS);
    try {
      const response = await fetch(target.url, {
        method: "POST",
        headers: target.headers,
        signal: controller.signal,
        body: target.body,
      });
      const body = (await response.json()) as GeminiImageApiResponse;
      if (!response.ok) {
        lastReason = failureReason(response.status, body, model);
        if (!isRetryableGeminiFailure(response.status, body.error?.message)) break;
        continue;
      }

      const image = extractInlineImage(body);
      if (!image) {
        const finish = body.candidates?.[0]?.finishReason;
        lastReason = finish
          ? `Gemini 画像生成が完了しませんでした（${finish}）`
          : "Gemini から画像が返りませんでした。";
        continue;
      }

      const mimeType = image.mimeType.split(";")[0]!.trim() || "image/png";
      const dataUrl = `data:${mimeType};base64,${image.data}`;
      return { ok: true, dataUrl, mimeType, model };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastReason = "Gemini 画像生成がタイムアウトしました。";
      } else {
        lastReason =
          error instanceof Error
            ? `Gemini 画像生成エラー: ${error.message}`
            : "Gemini 画像生成エラー";
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, reason: lastReason };
}

/** モデルが JSON を ```json フェンスで包んで返すことがあるため剥がす */
export function stripJsonFence(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced ? fenced[1] : text.trim();
}
