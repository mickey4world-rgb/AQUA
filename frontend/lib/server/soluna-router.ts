import { getAnthropicModel, isAnthropicConfigured } from "@/lib/server/anthropic";
import {
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { getGeminiModel, isGeminiConfigured } from "@/lib/server/gemini";
import type { SolunaCharacter } from "@/lib/types/soluna";

export type SolunaProvider = "gemini" | "openai" | "claude";

/** 親密度に応じた知能ティア — 育つほど最新・高性能モデルへ */
export type SolunaGrowthTier = "budding" | "growing" | "mature";

export type SolunaRouteAssignment = {
  provider: SolunaProvider;
  model: string;
  tier: SolunaGrowthTier;
  tierLevel: 1 | 2 | 3;
  reason: string;
};

export type SolunaRoutePlan = {
  sol: SolunaRouteAssignment;
  luna: SolunaRouteAssignment;
};

const SOL_GEMINI_HINTS =
  /目標|タスク|計画|進捗|成功|趣味|やること|行動|達成|仕事|今日|明日|習慣|挑戦|一歩|整理したい|motivation/i;
const SOL_CLAUDE_HINTS =
  /なぜ|意味|戦略|考え方|判断|優先|整理|分析|深く|本質|方針|選択|trade.?off|どうすれば/i;
const LUNA_CLAUDE_HINTS =
  /感情|不安|悲し|疲れ|心|癒|ストレス|悩み|辛い|寂し|話を聞|共感|モヤ|落ち込|つらい|しんど|眠れ|孤独/i;
const LUNA_OPENAI_HINTS =
  /体調|健康|睡眠|食事|頭痛|風邪|病院|薬|疲労|コンディション/i;
const REFLECTIVE_HINTS =
  /なぜ|意味|哲学|創作|物語|詩|想像|内省|自分らし|人生|価値|本当に/i;

const TIER_LEVEL: Record<SolunaGrowthTier, 1 | 2 | 3> = {
  budding: 1,
  growing: 2,
  mature: 3,
};

export function resolveGrowthTier(intimacy: number): SolunaGrowthTier {
  if (intimacy >= 81) return "mature";
  if (intimacy >= 41) return "growing";
  return "budding";
}

export function formatGrowthTierLabel(tier: SolunaGrowthTier): string {
  switch (tier) {
    case "budding":
      return "知能 Lv.1";
    case "growing":
      return "知能 Lv.2";
    case "mature":
      return "知能 Lv.3";
  }
}

export function getAvailableSolunaProviders(): SolunaProvider[] {
  const providers: SolunaProvider[] = [];
  if (isGeminiConfigured()) providers.push("gemini");
  if (isAzureOpenAiConfigured()) providers.push("openai");
  if (isAnthropicConfigured()) providers.push("claude");
  return providers;
}

/** Soluna は海外リージョン Azure OpenAI 可 — 最新デプロイを優先 */
function getOpenAiDeployment(tier: SolunaGrowthTier): string {
  if (tier === "mature") {
    return (
      process.env.SOLUNA_OPENAI_DEPLOYMENT_ADVANCED?.trim() ||
      process.env.AZURE_OPENAI_DEPLOYMENT_GLOBAL?.trim() ||
      process.env.SOLUNA_OPENAI_DEPLOYMENT?.trim() ||
      process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ||
      process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
      getAzureOpenAiDeployment()
    );
  }
  if (tier === "budding") {
    return (
      process.env.SOLUNA_OPENAI_DEPLOYMENT_FAST?.trim() ||
      process.env.SOLUNA_OPENAI_DEPLOYMENT?.trim() ||
      process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ||
      process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
      getAzureOpenAiDeployment()
    );
  }
  return (
    process.env.SOLUNA_OPENAI_DEPLOYMENT?.trim() ||
    process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT_GLOBAL?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    getAzureOpenAiDeployment()
  );
}

function getGeminiModelForTier(tier: SolunaGrowthTier): string {
  if (tier === "mature") {
    return (
      process.env.SOLUNA_GEMINI_MODEL_ADVANCED?.trim() ||
      process.env.SOLUNA_GEMINI_MODEL?.trim() ||
      process.env.SOLUNA_SOL_MODEL?.trim() ||
      getGeminiModel()
    );
  }
  if (tier === "budding") {
    return (
      process.env.SOLUNA_GEMINI_MODEL_FAST?.trim() ||
      process.env.SOLUNA_GEMINI_MODEL?.trim() ||
      process.env.SOLUNA_SOL_MODEL?.trim() ||
      getGeminiModel()
    );
  }
  return (
    process.env.SOLUNA_GEMINI_MODEL?.trim() ||
    process.env.SOLUNA_SOL_MODEL?.trim() ||
    getGeminiModel()
  );
}

function getClaudeModelForTier(tier: SolunaGrowthTier): string {
  if (tier === "mature") {
    return (
      process.env.ANTHROPIC_MODEL_ADVANCED?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      getAnthropicModel()
    );
  }
  if (tier === "budding") {
    return (
      process.env.ANTHROPIC_MODEL_FAST?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      getAnthropicModel()
    );
  }
  return process.env.ANTHROPIC_MODEL?.trim() || getAnthropicModel();
}

export function getModelForProvider(
  provider: SolunaProvider,
  tier: SolunaGrowthTier = "growing",
): string {
  switch (provider) {
    case "gemini":
      return getGeminiModelForTier(tier);
    case "openai":
      return getOpenAiDeployment(tier);
    case "claude":
      return getClaudeModelForTier(tier);
  }
}

export function formatSolunaProviderLabel(provider: SolunaProvider): string {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "openai":
      return "Azure OpenAI";
    case "claude":
      return "Claude";
  }
}

function scoreProvider(
  character: SolunaCharacter,
  provider: SolunaProvider,
  message: string,
): number {
  let score = 0;

  if (character === "sol") {
    if (provider === "gemini" && SOL_GEMINI_HINTS.test(message)) score += 3;
    if (provider === "claude" && SOL_CLAUDE_HINTS.test(message)) score += 3;
    if (provider === "openai") score += 1;
    if (provider === "gemini") score += 1;
    if (REFLECTIVE_HINTS.test(message) && provider === "claude") score += 2;
  } else {
    if (provider === "claude" && LUNA_CLAUDE_HINTS.test(message)) score += 3;
    if (provider === "openai" && LUNA_OPENAI_HINTS.test(message)) score += 3;
    if (provider === "openai") score += 1;
    if (provider === "claude") score += 1;
    if (REFLECTIVE_HINTS.test(message) && provider === "claude") score += 2;
  }

  return score;
}

function defaultReason(character: SolunaCharacter, provider: SolunaProvider): string {
  if (provider === "gemini") {
    return character === "sol" ? "目標・行動系の即応" : "軽快な共感返答";
  }
  if (provider === "claude") {
    return character === "sol" ? "深い整理・判断支援" : "感情・内省の受け止め";
  }
  return character === "sol" ? "バランス型の伴走" : "安定した共感応答";
}

function buildAssignment(
  character: SolunaCharacter,
  provider: SolunaProvider,
  intimacy: number,
  baseReason: string,
): SolunaRouteAssignment {
  const tier = resolveGrowthTier(intimacy);
  return {
    provider,
    model: getModelForProvider(provider, tier),
    tier,
    tierLevel: TIER_LEVEL[tier],
    reason: `${baseReason} · ${formatGrowthTierLabel(tier)}`,
  };
}

function pickBestProvider(
  character: SolunaCharacter,
  message: string,
  intimacy: number,
  available: SolunaProvider[],
  exclude?: SolunaProvider,
): SolunaRouteAssignment {
  const candidates = available.filter((provider) => provider !== exclude);
  const pool = candidates.length > 0 ? candidates : available;

  let best = pool[0];
  let bestScore = -1;

  for (const provider of pool) {
    const score = scoreProvider(character, provider, message);
    if (score > bestScore) {
      bestScore = score;
      best = provider;
    }
  }

  const reason =
    bestScore > 1 ? "質問内容に合わせて自動選択" : defaultReason(character, best);
  return buildAssignment(character, best, intimacy, reason);
}

/** 質問内容 + 親密度から Sol / Luna に異なるプロバイダを割り当て（即時） */
export function routeSolunaModels(
  message: string,
  solIntimacy: number,
  lunaIntimacy: number,
): SolunaRoutePlan {
  const available = getAvailableSolunaProviders();

  if (available.length === 0) {
    const solTier = resolveGrowthTier(solIntimacy);
    const lunaTier = resolveGrowthTier(lunaIntimacy);
    return {
      sol: {
        provider: "gemini",
        model: getModelForProvider("gemini", solTier),
        tier: solTier,
        tierLevel: TIER_LEVEL[solTier],
        reason: "未設定",
      },
      luna: {
        provider: "openai",
        model: getModelForProvider("openai", lunaTier),
        tier: lunaTier,
        tierLevel: TIER_LEVEL[lunaTier],
        reason: "未設定",
      },
    };
  }

  if (available.length === 1) {
    const only = available[0];
    return {
      sol: buildAssignment("sol", only, solIntimacy, "利用可能なモデル"),
      luna: buildAssignment("luna", only, lunaIntimacy, "利用可能なモデル"),
    };
  }

  const sol = pickBestProvider("sol", message, solIntimacy, available);
  const luna = pickBestProvider("luna", message, lunaIntimacy, available, sol.provider);

  if (luna.provider === sol.provider) {
    const alternate = available.find((provider) => provider !== sol.provider);
    if (alternate) {
      return {
        sol,
        luna: buildAssignment("luna", alternate, lunaIntimacy, defaultReason("luna", alternate)),
      };
    }
  }

  return { sol, luna };
}

export function listFallbackProviders(
  character: SolunaCharacter,
  message: string,
  exclude: SolunaProvider,
): SolunaProvider[] {
  const available = getAvailableSolunaProviders().filter((provider) => provider !== exclude);
  return available.sort(
    (a, b) => scoreProvider(character, b, message) - scoreProvider(character, a, message),
  );
}
