import { canUseAiTokens, getMonthlyTokenCostUsd } from "@/lib/server/token-usage";

export type SolunaCostMode = "normal" | "economy" | "minimal";

export type SolunaCostAssessment = {
  mode: SolunaCostMode;
  monthlyCostUsd: number;
  monthlyTokens: number;
  tokenLimit: number;
  usageRatio: number;
  reason: string;
};

function parseUsdEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 月間コスト・トークン使用率から Soluna のモデル tier を調整 */
export async function assessSolunaCostMode(userId: string): Promise<SolunaCostAssessment> {
  const economyUsd = parseUsdEnv("SOLUNA_COST_ECONOMY_USD", 8);
  const minimalUsd = parseUsdEnv("SOLUNA_COST_MINIMAL_USD", 20);
  const economyRatio = parseUsdEnv("SOLUNA_COST_ECONOMY_RATIO", 0.65);
  const minimalRatio = parseUsdEnv("SOLUNA_COST_MINIMAL_RATIO", 0.85);

  const [monthlyCostUsd, quota] = await Promise.all([
    getMonthlyTokenCostUsd(userId),
    canUseAiTokens(userId),
  ]);

  const usageRatio = quota.limit > 0 ? quota.used / quota.limit : 0;

  if (monthlyCostUsd >= minimalUsd || usageRatio >= minimalRatio) {
    return {
      mode: "minimal",
      monthlyCostUsd,
      monthlyTokens: quota.used,
      tokenLimit: quota.limit,
      usageRatio,
      reason: "今月の利用が多いため、軽量モデル優先モードです",
    };
  }

  if (monthlyCostUsd >= economyUsd || usageRatio >= economyRatio) {
    return {
      mode: "economy",
      monthlyCostUsd,
      monthlyTokens: quota.used,
      tokenLimit: quota.limit,
      usageRatio,
      reason: "コスト調整のため、やや軽いモデルを選んでいます",
    };
  }

  return {
    mode: "normal",
    monthlyCostUsd,
    monthlyTokens: quota.used,
    tokenLimit: quota.limit,
    usageRatio,
    reason: "最新モデルを優先",
  };
}

export function applyCostModeToTier(
  tier: "budding" | "growing" | "mature",
  costMode: SolunaCostMode,
): "budding" | "growing" | "mature" {
  if (costMode === "normal") return tier;
  if (costMode === "economy") {
    if (tier === "mature") return "growing";
    return "budding";
  }
  return "budding";
}
