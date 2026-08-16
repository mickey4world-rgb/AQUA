/**
 * Claude — Azure AI Foundry 優先、Anthropic 直 API はフォールバック
 * @see https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude
 */

import {
  SOLUNA_CLAUDE_DEPLOYMENT_DEFAULTS,
  SOLUNA_CLAUDE_FABLE_DEPLOYMENT,
} from "@/lib/server/soluna-model-catalog";

const DIRECT_API_BASE = "https://api.anthropic.com/v1";
const DEFAULT_DIRECT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_FOUNDRY_DEPLOYMENT = SOLUNA_CLAUDE_DEPLOYMENT_DEFAULTS.growing;
const REQUEST_TIMEOUT_MS = 45_000;

export type ClaudeBackend = "foundry" | "direct";

type FoundryConfig = {
  messagesUrl: string;
  apiKey: string;
};

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function getFoundryConfig(): FoundryConfig | null {
  const apiKey =
    trimEnv("AZURE_FOUNDRY_CLAUDE_API_KEY") ?? trimEnv("ANTHROPIC_FOUNDRY_API_KEY");
  if (!apiKey) return null;

  const explicitBase =
    trimEnv("AZURE_FOUNDRY_CLAUDE_BASE_URL") ?? trimEnv("ANTHROPIC_FOUNDRY_BASE_URL");
  if (explicitBase) {
    const base = explicitBase.replace(/\/$/, "");
    const messagesUrl = base.endsWith("/v1/messages")
      ? base
      : `${base}/v1/messages`;
    return { messagesUrl, apiKey };
  }

  const resource =
    trimEnv("AZURE_FOUNDRY_CLAUDE_RESOURCE") ?? trimEnv("ANTHROPIC_FOUNDRY_RESOURCE");
  if (!resource) return null;

  return {
    messagesUrl: `https://${resource}.services.ai.azure.com/anthropic/v1/messages`,
    apiKey,
  };
}

export function getClaudeBackend(): ClaudeBackend | null {
  if (getFoundryConfig()) return "foundry";
  if (trimEnv("ANTHROPIC_API_KEY")) return "direct";
  return null;
}

export function isAzureFoundryClaudeConfigured(): boolean {
  return getFoundryConfig() != null;
}

/** Foundry または Anthropic 直 API のいずれかが設定済み */
export function isAnthropicConfigured(): boolean {
  return getClaudeBackend() != null;
}

export function getAnthropicModel(): string {
  return trimEnv("ANTHROPIC_MODEL") ?? DEFAULT_DIRECT_MODEL;
}

export function getFoundryClaudeDeployment(tier: "budding" | "growing" | "mature" = "growing"): string {
  const fallback = SOLUNA_CLAUDE_DEPLOYMENT_DEFAULTS[tier];
  if (tier === "mature") {
    return (
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_FABLE") ??
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED") ??
      trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT_ADVANCED") ??
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT") ??
      trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT") ??
      fallback
    );
  }
  if (tier === "budding") {
    return (
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_FAST") ??
      trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT_FAST") ??
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT") ??
      trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT") ??
      fallback
    );
  }
  return (
    trimEnv("SOLUNA_CLAUDE_DEPLOYMENT") ??
    trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT") ??
    fallback
  );
}

/** Fable 5 を Lv.3 明示指定したい場合 */
export function getFoundryClaudeFableDeployment(): string {
  return (
    trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_FABLE") ??
    SOLUNA_CLAUDE_FABLE_DEPLOYMENT
  );
}

export function formatClaudeProviderLabel(): string {
  return getClaudeBackend() === "foundry" ? "Azure Claude" : "Claude";
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
  tier?: "budding" | "growing" | "mature";
  /** 未指定時は 45 秒 */
  timeoutMs?: number;
};

export type AnthropicResult =
  | {
      ok: true;
      text: string;
      model: string;
      backend: ClaudeBackend;
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

function resolveModel(request: AnthropicRequest, backend: ClaudeBackend): string {
  if (request.model?.trim()) return request.model.trim();
  if (backend === "foundry") {
    return getFoundryClaudeDeployment(request.tier ?? "growing");
  }
  return getAnthropicModel();
}

function buildSetupError(): string {
  return (
    "Claude が未設定です。Azure AI Foundry なら AZURE_FOUNDRY_CLAUDE_RESOURCE と " +
    "AZURE_FOUNDRY_CLAUDE_API_KEY（＋ SOLUNA_CLAUDE_DEPLOYMENT）を設定してください。"
  );
}

export async function generateWithAnthropic(
  request: AnthropicRequest,
): Promise<AnthropicResult> {
  const backend = getClaudeBackend();
  if (!backend) {
    return { ok: false, reason: buildSetupError() };
  }

  const model = resolveModel(request, backend);
  const timeoutMs = request.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const foundry = backend === "foundry" ? getFoundryConfig() : null;
  const directKey = trimEnv("ANTHROPIC_API_KEY");

  const url =
    backend === "foundry" && foundry
      ? foundry.messagesUrl
      : `${DIRECT_API_BASE}/messages`;
  const apiKey = backend === "foundry" && foundry ? foundry.apiKey : directKey;

  if (!apiKey) {
    return { ok: false, reason: buildSetupError() };
  }

  try {
    const response = await fetch(url, {
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
        return {
          ok: false,
          reason:
            backend === "foundry"
              ? "Azure Foundry Claude の API キーが正しくありません。"
              : "ANTHROPIC_API_KEY が正しくありません。",
        };
      }
      if (response.status === 429) {
        return { ok: false, reason: "Claude のレート上限に達しました。少し待ってから再度お試しください。" };
      }
      return {
        ok: false,
        reason: `Claude API エラー (${backend}): ${message}`,
      };
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
      backend,
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
