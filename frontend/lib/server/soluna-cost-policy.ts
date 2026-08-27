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

const ASSESSMENT_TTL_MS = 5 * 60 * 1000;
const assessmentCache = new Map<
  string,
  { expiresAt: number; value: SolunaCostAssessment }
>();

function parseUsdEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 月間コスト・トークン使用率から Soluna のモデル tier を調整 */
export async function assessSolunaCostMode(userId: string): Promise<SolunaCostAssessment> {
  const cached = assessmentCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // 早めに economy / minimal へ寄せて有料モデルを抑える（env で上書き可）
  const economyUsd = parseUsdEnv("SOLUNA_COST_ECONOMY_USD", 4);
  const minimalUsd = parseUsdEnv("SOLUNA_COST_MINIMAL_USD", 10);
  const economyRatio = parseUsdEnv("SOLUNA_COST_ECONOMY_RATIO", 0.5);
  const minimalRatio = parseUsdEnv("SOLUNA_COST_MINIMAL_RATIO", 0.75);

  const [monthlyCostUsd, quota] = await Promise.all([
    getMonthlyTokenCostUsd(userId),
    canUseAiTokens(userId),
  ]);

  const usageRatio = quota.limit > 0 ? quota.used / quota.limit : 0;

  let value: SolunaCostAssessment;
  if (monthlyCostUsd >= minimalUsd || usageRatio >= minimalRatio) {
    value = {
      mode: "minimal",
      monthlyCostUsd,
      monthlyTokens: quota.used,
      tokenLimit: quota.limit,
      usageRatio,
      reason: "今月の利用が多いため、軽量モデル優先モードです",
    };
  } else if (monthlyCostUsd >= economyUsd || usageRatio >= economyRatio) {
    value = {
      mode: "economy",
      monthlyCostUsd,
      monthlyTokens: quota.used,
      tokenLimit: quota.limit,
      usageRatio,
      reason: "コスト調整のため、やや軽いモデルを選んでいます",
    };
  } else {
    value = {
      mode: "normal",
      monthlyCostUsd,
      monthlyTokens: quota.used,
      tokenLimit: quota.limit,
      usageRatio,
      reason: "最新モデルを優先",
    };
  }

  assessmentCache.set(userId, { expiresAt: Date.now() + ASSESSMENT_TTL_MS, value });
  return value;
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
