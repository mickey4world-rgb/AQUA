/**
 * Google AI Studio (Gemini) の無料枠を利用する薄いクライアント。
 * SDK を足さず fetch のみで呼ぶ。課金 API（Vertex AI）は使わない。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";
const REQUEST_TIMEOUT_MS = 30_000;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
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

function failureReason(status: number, body: GeminiApiResponse): string {
  if (status === 429) {
    return "Gemini 無料枠のレート上限に達しました。1分ほど待ってから再度お試しください。";
  }
  if (status === 400 && body.error?.message?.includes("API key")) {
    return "GEMINI_API_KEY が正しくありません。Google AI Studio のキーを確認してください。";
  }
  if (status === 403) {
    return "Gemini API へのアクセスが拒否されました。API キーの権限を確認してください。";
  }
  return body.error?.message
    ? `Gemini API エラー: ${body.error.message}`
    : `Gemini API エラー（HTTP ${status}）`;
}

export async function generateWithGemini(
  request: GeminiRequest,
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason:
        "Gemini が未設定です。Google AI Studio で発行した GEMINI_API_KEY を環境変数に設定してください。",
    };
  }

  const model = getGeminiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxOutputTokens ?? 1200,
            ...(request.responseMimeType
              ? { responseMimeType: request.responseMimeType }
              : {}),
          },
        }),
      },
    );

    const body = (await response.json()) as GeminiApiResponse;

    if (!response.ok) {
      return { ok: false, reason: failureReason(response.status, body) };
    }

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      return { ok: false, reason: "Gemini から応答がありませんでした。" };
    }

    return {
      ok: true,
      text,
      model,
      promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "Gemini への接続がタイムアウトしました。" };
    }
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Gemini への接続に失敗しました: ${error.message}`
          : "Gemini への接続に失敗しました",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** モデルが JSON を ```json フェンスで包んで返すことがあるため剥がす */
export function stripJsonFence(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced ? fenced[1] : text.trim();
}
