import { getFoundryClaudeDeployment, isAnthropicConfigured, isAzureFoundryClaudeConfigured } from "@/lib/server/anthropic";
import {
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { getGeminiModel, isGeminiConfigured } from "@/lib/server/gemini";
import type { SolunaCostMode } from "@/lib/server/soluna-cost-policy";
import type { SolunaProvider } from "@/lib/types/soluna";

export type SolunaModelTier = "budding" | "growing" | "mature";

export type ModelCostClass = "free" | "low" | "medium" | "high" | "premium";

export type ModelCandidate = {
  provider: SolunaProvider;
  modelId: string;
  displayName: string;
  costClass: ModelCostClass;
  /** この tier 以上で選択可能 */
  minTier: SolunaModelTier;
  priority: number;
};

const TIER_RANK: Record<SolunaModelTier, number> = {
  budding: 1,
  growing: 2,
  mature: 3,
};

/** 新しい順・高性能順（priority 大きいほど優先） */
const MODEL_CATALOG: ModelCandidate[] = [
  // OpenAI / Azure
  { provider: "openai", modelId: "council-gpt5", displayName: "GPT-5 系", costClass: "premium", minTier: "growing", priority: 100 },
  { provider: "openai", modelId: "gpt-5.5", displayName: "GPT-5.5", costClass: "premium", minTier: "growing", priority: 99 },
  { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", costClass: "high", minTier: "growing", priority: 70 },
  { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o mini", costClass: "low", minTier: "budding", priority: 40 },
  { provider: "openai", modelId: "stock-advice", displayName: "Azure OpenAI", costClass: "medium", minTier: "budding", priority: 30 },

  // Claude / Foundry
  { provider: "claude", modelId: "claude-opus-5", displayName: "Claude Opus 5", costClass: "premium", minTier: "mature", priority: 100 },
  { provider: "claude", modelId: "claude-fable-5", displayName: "Claude Fable 5", costClass: "premium", minTier: "mature", priority: 98 },
  { provider: "claude", modelId: "claude-sonnet-5", displayName: "Claude Sonnet 5", costClass: "high", minTier: "growing", priority: 85 },
  { provider: "claude", modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", costClass: "high", minTier: "growing", priority: 80 },
  { provider: "claude", modelId: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", costClass: "low", minTier: "budding", priority: 45 },

  // Gemini
  { provider: "gemini", modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", costClass: "free", minTier: "mature", priority: 90 },
  { provider: "gemini", modelId: "gemini-flash-latest", displayName: "Gemini Flash", costClass: "free", minTier: "budding", priority: 80 },
  { provider: "gemini", modelId: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", costClass: "free", minTier: "budding", priority: 70 },
];

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function collectEnvDeployments(): Set<string> {
  const keys = [
    "SOLUNA_OPENAI_DEPLOYMENT_ADVANCED",
    "SOLUNA_OPENAI_DEPLOYMENT",
    "SOLUNA_OPENAI_DEPLOYMENT_FAST",
    "SOLUNA_LUNA_DEPLOYMENT",
    "AZURE_OPENAI_DEPLOYMENT_GLOBAL",
    "AZURE_OPENAI_DEPLOYMENT_GLOBAL_A",
    "AZURE_OPENAI_DEPLOYMENT",
    "SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED",
    "SOLUNA_CLAUDE_DEPLOYMENT_FABLE",
    "SOLUNA_CLAUDE_DEPLOYMENT",
    "SOLUNA_CLAUDE_DEPLOYMENT_FAST",
    "AZURE_FOUNDRY_CLAUDE_DEPLOYMENT_ADVANCED",
    "AZURE_FOUNDRY_CLAUDE_DEPLOYMENT",
    "AZURE_FOUNDRY_CLAUDE_DEPLOYMENT_FAST",
    "SOLUNA_GEMINI_MODEL_ADVANCED",
    "SOLUNA_GEMINI_MODEL",
    "SOLUNA_GEMINI_MODEL_FAST",
    "SOLUNA_SOL_MODEL",
    "GEMINI_MODEL",
    "ANTHROPIC_MODEL_ADVANCED",
    "ANTHROPIC_MODEL",
  ];

  const set = new Set<string>();
  for (const key of keys) {
    const value = trimEnv(key);
    if (value) set.add(value.toLowerCase());
  }
  if (isAzureOpenAiConfigured()) {
    set.add(getAzureOpenAiDeployment().toLowerCase());
  }
  if (isGeminiConfigured()) {
    set.add(getGeminiModel().toLowerCase());
  }
  return set;
}

function isProviderAvailable(provider: SolunaProvider): boolean {
  switch (provider) {
    case "gemini":
      return isGeminiConfigured();
    case "openai":
      return isAzureOpenAiConfigured();
    case "claude":
      return isAnthropicConfigured();
  }
}

function matchesDeployment(envValue: string, candidate: ModelCandidate): boolean {
  const dep = envValue.toLowerCase();
  const id = candidate.modelId.toLowerCase();
  return dep === id || dep.includes(id) || id.includes(dep);
}

function claudeEnvDeployments(): string[] {
  return [
    trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED"),
    trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_FABLE"),
    trimEnv("SOLUNA_CLAUDE_DEPLOYMENT"),
    trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_FAST"),
    trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT_ADVANCED"),
    trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT"),
    trimEnv("AZURE_FOUNDRY_CLAUDE_DEPLOYMENT_FAST"),
    trimEnv("ANTHROPIC_MODEL_ADVANCED"),
    trimEnv("ANTHROPIC_MODEL"),
  ].filter((value): value is string => Boolean(value));
}

function resolveDeploymentName(candidate: ModelCandidate, tier: SolunaModelTier): string {
  if (candidate.provider === "claude" && isAzureFoundryClaudeConfigured()) {
    return getFoundryClaudeDeployment(tier);
  }

  const envKeys =
    candidate.provider === "openai"
      ? [
          "SOLUNA_OPENAI_DEPLOYMENT_ADVANCED",
          "SOLUNA_OPENAI_DEPLOYMENT",
          "SOLUNA_OPENAI_DEPLOYMENT_FAST",
          "SOLUNA_LUNA_DEPLOYMENT",
          "AZURE_OPENAI_DEPLOYMENT_GLOBAL",
          "AZURE_OPENAI_DEPLOYMENT",
        ]
      : candidate.provider === "gemini"
        ? [
            "SOLUNA_GEMINI_MODEL_ADVANCED",
            "SOLUNA_GEMINI_MODEL",
            "SOLUNA_GEMINI_MODEL_FAST",
            "SOLUNA_SOL_MODEL",
            "GEMINI_MODEL",
          ]
        : [
            "SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED",
            "SOLUNA_CLAUDE_DEPLOYMENT_FABLE",
            "SOLUNA_CLAUDE_DEPLOYMENT",
            "SOLUNA_CLAUDE_DEPLOYMENT_FAST",
            "ANTHROPIC_MODEL_ADVANCED",
            "ANTHROPIC_MODEL",
          ];

  for (const key of envKeys) {
    const value = trimEnv(key);
    if (value && matchesDeployment(value, candidate)) return value;
  }

  if (candidate.provider === "openai" && isAzureOpenAiConfigured()) {
    return getAzureOpenAiDeployment();
  }
  if (candidate.provider === "gemini" && isGeminiConfigured()) {
    return getGeminiModel();
  }

  return candidate.modelId;
}

function isCandidateConfigured(candidate: ModelCandidate, configured: Set<string>): boolean {
  if (candidate.provider === "gemini" && isGeminiConfigured()) return true;

  if (candidate.provider === "openai" && isAzureOpenAiConfigured()) {
    if (configured.size === 0) return true;
    for (const dep of configured) {
      if (matchesDeployment(dep, candidate)) return true;
    }
    return candidate.modelId.toLowerCase() === getAzureOpenAiDeployment().toLowerCase();
  }

  if (candidate.provider === "claude") {
    if (isAzureFoundryClaudeConfigured()) {
      const deps = claudeEnvDeployments();
      if (deps.length === 0) return true;
      return deps.some((dep) => matchesDeployment(dep, candidate));
    }
    if (!isAnthropicConfigured()) return false;
    for (const dep of configured) {
      if (matchesDeployment(dep, candidate)) return true;
    }
    return claudeEnvDeployments().length === 0;
  }

  if (configured.has(candidate.modelId.toLowerCase())) return true;
  for (const dep of configured) {
    if (matchesDeployment(dep, candidate)) return true;
  }
  return false;
}

function maxCostForMode(costMode: SolunaCostMode): ModelCostClass {
  switch (costMode) {
    case "normal":
      return "premium";
    case "economy":
      return "medium";
    case "minimal":
      return "low";
  }
}

const COST_RANK: Record<ModelCostClass, number> = {
  free: 0,
  low: 1,
  medium: 2,
  high: 3,
  premium: 4,
};

export function listAvailableModels(costMode: SolunaCostMode = "normal"): ModelCandidate[] {
  const configured = collectEnvDeployments();
  const maxCost = maxCostForMode(costMode);

  return MODEL_CATALOG.filter(
    (candidate) =>
      isProviderAvailable(candidate.provider) &&
      isCandidateConfigured(candidate, configured) &&
      COST_RANK[candidate.costClass] <= COST_RANK[maxCost],
  ).sort((a, b) => b.priority - a.priority);
}

export function resolveModelForProvider(
  provider: SolunaProvider,
  tier: SolunaModelTier,
  costMode: SolunaCostMode,
): { modelId: string; displayName: string; reason: string } {
  const configured = collectEnvDeployments();
  const maxCost = maxCostForMode(costMode);
  const tierRank = TIER_RANK[tier];

  const candidates = MODEL_CATALOG.filter(
    (c) =>
      c.provider === provider &&
      isProviderAvailable(provider) &&
      TIER_RANK[c.minTier] <= tierRank &&
      COST_RANK[c.costClass] <= COST_RANK[maxCost] &&
      isCandidateConfigured(c, configured),
  ).sort((a, b) => b.priority - a.priority);

  if (candidates.length > 0) {
    const pick = candidates[0];
    const modelId = resolveDeploymentName(pick, tier);
    const costNote =
      costMode === "normal" ? "最新優先" : costMode === "economy" ? "コスト調整" : "軽量優先";
    return {
      modelId,
      displayName: pick.displayName,
      reason: `${costNote} · ${pick.displayName}`,
    };
  }

  // フォールバック — env から直接
  if (provider === "openai") {
    const dep =
      trimEnv("SOLUNA_OPENAI_DEPLOYMENT_ADVANCED") ??
      trimEnv("AZURE_OPENAI_DEPLOYMENT_GLOBAL") ??
      trimEnv("SOLUNA_LUNA_DEPLOYMENT") ??
      getAzureOpenAiDeployment();
    return { modelId: dep, displayName: dep, reason: "設定デプロイ" };
  }
  if (provider === "claude") {
    const dep =
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED") ??
      trimEnv("SOLUNA_CLAUDE_DEPLOYMENT") ??
      "claude-sonnet-5";
    return { modelId: dep, displayName: dep, reason: "設定デプロイ" };
  }
  const model =
    trimEnv("SOLUNA_GEMINI_MODEL_ADVANCED") ??
    trimEnv("SOLUNA_SOL_MODEL") ??
    getGeminiModel();
  return { modelId: model, displayName: "Gemini Flash", reason: "Gemini 優先" };
}

export function costBiasForProvider(
  provider: SolunaProvider,
  costMode: SolunaCostMode,
): number {
  // normal でも無料 Gemini をわずかに優遇（同点付近の有料偏りを緩和）
  if (costMode === "normal") {
    if (provider === "gemini") return 1;
    if (provider === "claude") return -0.5;
    return 0;
  }
  if (provider === "gemini") return costMode === "minimal" ? 6 : 3;
  if (provider === "openai") return costMode === "minimal" ? -3 : -1.5;
  if (provider === "claude") return costMode === "minimal" ? -4 : -2;
  return 0;
}

export function formatModelUsedLabel(
  provider: SolunaProvider,
  modelId: string,
  displayName?: string,
): string {
  const providerLabel =
    provider === "gemini" ? "Gemini" : provider === "openai" ? "Azure OpenAI" : "Azure Claude";
  const name = displayName && displayName !== modelId ? `${displayName} (${modelId})` : modelId;
  return `${providerLabel} · ${name}`;
}
