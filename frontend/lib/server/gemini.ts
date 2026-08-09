/**
 * Google AI Studio (Gemini) の無料枠を利用する薄いクライアント。
 * SDK を足さず fetch のみで呼ぶ。課金 API（Vertex AI）は使わない。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** 思考モデル。maxOutputTokens には思考分（1000〜1500程度）を上乗せして渡すこと。 */
const DEFAULT_MODEL = "gemini-flash-latest";
const REQUEST_TIMEOUT_MS = 45_000;

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
            maxOutputTokens: request.maxOutputTokens ?? 3000,
            ...(request.responseMimeType
              ? { responseMimeType: request.responseMimeType }
              : {}),
          },
        }),
      },
    );

    const body = (await response.json()) as GeminiApiResponse;

    if (!response.ok) {
      return { ok: false, reason: failureReason(response.status, body, model) };
    }

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      // 思考トークンだけで maxOutputTokens を使い切ると本文が空で返る
      const truncated = body.candidates?.[0]?.finishReason === "MAX_TOKENS";
      return {
        ok: false,
        reason: truncated
          ? "回答が長くなりすぎて生成が打ち切られました。相談内容を短く区切って送ってください。"
          : "Gemini から応答がありませんでした。",
      };
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
