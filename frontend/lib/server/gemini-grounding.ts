/**
 * Gemini Google Search grounding（ニュース討伐・人間チャット共用）
 */
import { isGeminiConfigured } from "@/lib/server/gemini";

const DEFAULT_TIMEOUT_MS = 18_000;

function getGroundingModelCandidates(): string[] {
  const env =
    process.env.SOLUNA_WEB_GEMINI_MODEL?.trim() ||
    process.env.SOLUNA_NEWS_GEMINI_MODEL?.trim();
  const defaults = ["gemini-3.6-flash", "gemini-flash-latest"];
  return env ? [...new Set([env, ...defaults])] : defaults;
}

function getRelay(): { url: string; key: string } | null {
  const url = process.env.GEMINI_RELAY_URL?.trim();
  const key = process.env.GEMINI_RELAY_KEY?.trim();
  return url && key ? { url, key } : null;
}

async function generateWithGroundingOnce(
  model: string,
  system: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const relay = getRelay();
  const apiKey = process.env.GEMINI_API_KEY;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  };

  const target: { url: string; headers: Record<string, string>; body: string } = relay
    ? {
        url: relay.url,
        headers: {
          "Content-Type": "application/json",
          "x-functions-key": relay.key,
        },
        body: JSON.stringify({ model, body }),
      }
    : {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey as string,
        },
        body: JSON.stringify(body),
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

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        reason:
          payload.error?.message ??
          `Gemini grounding 失敗（HTTP ${response.status}）`,
      };
    }

    const text =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";
    if (!text.trim()) {
      return { ok: false, reason: "検索結果が空でした。" };
    }

    return { ok: true, text: text.trim(), model };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: aborted
        ? "検索がタイムアウトしました。"
        : "検索に失敗しました。",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateWithGoogleSearch(options: {
  system: string;
  userPrompt: string;
  timeoutMs?: number;
}): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: "Gemini が未設定です。" };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastReason = "検索に失敗しました。";
  for (const model of getGroundingModelCandidates()) {
    const result = await generateWithGroundingOnce(
      model,
      options.system,
      options.userPrompt,
      timeoutMs,
    );
    if (result.ok) return result;
    lastReason = result.reason;
    console.warn(`[gemini-grounding] failed for ${model}:`, result.reason);
  }

  return { ok: false, reason: lastReason };
}
