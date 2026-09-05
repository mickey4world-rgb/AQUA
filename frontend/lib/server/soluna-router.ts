import {
  formatClaudeProviderLabel,
  getFoundryClaudeDeployment,
  isAnthropicConfigured,
  isAzureFoundryClaudeConfigured,
} from "@/lib/server/anthropic";
import {
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { isGeminiConfigured } from "@/lib/server/gemini";
import {
  applyCostModeToTier,
  type SolunaCostMode,
} from "@/lib/server/soluna-cost-policy";
import {
  costBiasForProvider,
  formatModelUsedLabel,
  resolveModelForProvider,
} from "@/lib/server/soluna-model-registry";
import type { SolunaCharacter } from "@/lib/types/soluna";

export type SolunaProvider = "gemini" | "openai" | "claude";

/** 親密度に応じた知能ティア — 育つほど最新・高性能モデルへ */
export type SolunaGrowthTier = "budding" | "growing" | "mature";

export type SolunaRouteAssignment = {
  provider: SolunaProvider;
  model: string;
  modelDisplayName: string;
  modelLabel: string;
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

export function getModelForProvider(
  provider: SolunaProvider,
  tier: SolunaGrowthTier = "growing",
  costMode: SolunaCostMode = "normal",
): string {
  return resolveModelForProvider(provider, tier, costMode).modelId;
}

export function formatSolunaProviderLabel(provider: SolunaProvider): string {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "openai":
      return "Azure OpenAI";
    case "claude":
      return formatClaudeProviderLabel();
  }
}

function scoreProvider(
  character: SolunaCharacter,
  provider: SolunaProvider,
  message: string,
  costMode: SolunaCostMode,
): number {
  let score = costBiasForProvider(provider, costMode);

  if (character === "sol") {
    if (provider === "gemini" && SOL_GEMINI_HINTS.test(message)) score += 3;
    if (provider === "claude" && SOL_CLAUDE_HINTS.test(message)) score += 3;
    if (provider === "openai") score += 1;
    if (provider === "gemini") score += 1;
    if (REFLECTIVE_HINTS.test(message) && provider === "claude") score += 2;
  } else {
    // ルーナも Gemini を候補に入れて「応答できません」を減らす
    if (provider === "gemini") score += 2;
    if (provider === "claude" && LUNA_CLAUDE_HINTS.test(message)) score += 3;
    if (provider === "openai" && LUNA_OPENAI_HINTS.test(message)) score += 2;
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
  costMode: SolunaCostMode,
): SolunaRouteAssignment {
  const baseTier = resolveGrowthTier(intimacy);
  const tier = applyCostModeToTier(baseTier, costMode);
  const resolved = resolveModelForProvider(provider, tier, costMode);
  // Foundry Claude は env のデプロイ名を優先
  const model =
    provider === "claude" && isAzureFoundryClaudeConfigured()
      ? getFoundryClaudeDeployment(tier)
      : resolved.modelId;

  return {
    provider,
    model,
    modelDisplayName: resolved.displayName,
    modelLabel: formatModelUsedLabel(provider, model, resolved.displayName),
    tier,
    tierLevel: TIER_LEVEL[tier],
    reason: `${baseReason} · ${resolved.reason} · ${formatGrowthTierLabel(tier)}`,
  };
}

function pickBestProvider(
  character: SolunaCharacter,
  message: string,
  intimacy: number,
  available: SolunaProvider[],
  costMode: SolunaCostMode,
  exclude?: SolunaProvider,
): SolunaRouteAssignment {
  const candidates = available.filter((provider) => provider !== exclude);
  const pool = candidates.length > 0 ? candidates : available;

  let best = pool[0];
  let bestScore = -1;

  for (const provider of pool) {
    const score = scoreProvider(character, provider, message, costMode);
    if (score > bestScore) {
      bestScore = score;
      best = provider;
    }
  }

  const reason =
    bestScore > 1 ? "質問内容に合わせて自動選択" : defaultReason(character, best);
  return buildAssignment(character, best, intimacy, reason, costMode);
}

export type SolunaRouteOptions = {
  costMode?: SolunaCostMode;
  costReason?: string;
};

/** 質問内容 + 親密度 + コスト状況から Sol / Luna に異なるプロバイダを割り当て */
export function routeSolunaModels(
  message: string,
  solIntimacy: number,
  lunaIntimacy: number,
  options: SolunaRouteOptions = {},
): SolunaRoutePlan {
  const costMode = options.costMode ?? "normal";
  const costNote =
    costMode !== "normal" && options.costReason ? ` · ${options.costReason}` : "";
  const available = getAvailableSolunaProviders();

  if (available.length === 0) {
    const solTier = resolveGrowthTier(solIntimacy);
    const lunaTier = resolveGrowthTier(lunaIntimacy);
    return {
      sol: {
        provider: "gemini",
        model: getModelForProvider("gemini", solTier, costMode),
        modelDisplayName: "Gemini",
        modelLabel: formatModelUsedLabel("gemini", getModelForProvider("gemini", solTier, costMode)),
        tier: solTier,
        tierLevel: TIER_LEVEL[solTier],
        reason: "未設定",
      },
      luna: {
        provider: "openai",
        model: getModelForProvider("openai", lunaTier, costMode),
        modelDisplayName: "Azure OpenAI",
        modelLabel: formatModelUsedLabel("openai", getModelForProvider("openai", lunaTier, costMode)),
        tier: lunaTier,
        tierLevel: TIER_LEVEL[lunaTier],
        reason: "未設定",
      },
    };
  }

  if (available.length === 1) {
    const only = available[0];
    return {
      sol: buildAssignment("sol", only, solIntimacy, `利用可能なモデル${costNote}`, costMode),
      luna: buildAssignment("luna", only, lunaIntimacy, `利用可能なモデル${costNote}`, costMode),
    };
  }

  const sol = pickBestProvider("sol", message, solIntimacy, available, costMode);
  // ルーナはソルと別プロバイダを強制しない（別系統が落ちると「答えられない」が増えるため）
  const luna = pickBestProvider("luna", message, lunaIntimacy, available, costMode);

  if (costNote) {
    return {
      sol: { ...sol, reason: `${sol.reason}${costNote}` },
      luna: { ...luna, reason: `${luna.reason}${costNote}` },
    };
  }

  return { sol, luna };
}

export function listFallbackProviders(
  character: SolunaCharacter,
  message: string,
  exclude: SolunaProvider,
  costMode: SolunaCostMode = "normal",
): SolunaProvider[] {
  const available = getAvailableSolunaProviders().filter((provider) => provider !== exclude);
  return available.sort(
    (a, b) =>
      scoreProvider(character, b, message, costMode) -
      scoreProvider(character, a, message, costMode),
  );
}
