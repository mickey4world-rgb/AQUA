/**
 * Anthropic Claude — fetch のみ（SDK 不要）
 */

const API_BASE = "https://api.anthropic.com/v1";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const REQUEST_TIMEOUT_MS = 45_000;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AnthropicRequest = {
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

export type AnthropicResult =
  | {
      ok: true;
      text: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      stopReason?: string;
    }
  | { ok: false; reason: string };

type AnthropicApiResponse = {
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

export async function generateWithAnthropic(
  request: AnthropicRequest,
): Promise<AnthropicResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "Claude（Anthropic）が未設定です。ANTHROPIC_API_KEY を設定してください。" };
  }

  const model = request.model?.trim() || getAnthropicModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 350,
        temperature: request.temperature ?? 0.75,
        system: request.system,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });

    const body = (await response.json()) as AnthropicApiResponse;

    if (!response.ok) {
      const message = body.error?.message ?? `HTTP ${response.status}`;
      if (response.status === 401) {
        return { ok: false, reason: "ANTHROPIC_API_KEY が正しくありません。" };
      }
      if (response.status === 429) {
        return { ok: false, reason: "Claude のレート上限に達しました。少し待ってから再度お試しください。" };
      }
      return { ok: false, reason: `Claude API エラー: ${message}` };
    }

    const text = (body.content ?? [])
      .filter((part) => part.type === "text" || part.text)
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      return { ok: false, reason: "Claude から応答がありませんでした。" };
    }

    return {
      ok: true,
      text,
      model: body.model ?? model,
      promptTokens: body.usage?.input_tokens ?? 0,
      completionTokens: body.usage?.output_tokens ?? 0,
      stopReason: body.stop_reason,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "Claude への接続がタイムアウトしました。" };
    }
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Claude への接続に失敗しました: ${error.message}`
          : "Claude への接続に失敗しました",
    };
  } finally {
    clearTimeout(timeout);
  }
}
