import { canUseAiTokens, getMonthlyTokenCostUsd } from "@/lib/server/token-usage";

export type SolunaCostMode = "normal" | "economy" | "minimal";

export type SolunaCostAssessment = {
  mode: SolunaCostMode;
  monthlyCostUsd: number;
  monthlyTokens: number;
  tokenLimit: number;
  usageRatio: number;
  /** 1行サマリ（通知・ルート理由用） */
  reason: string;
  /** UI 向け：投資／コスト判断の分かりやすい箇条書き */
  reasonBullets: string[];
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

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function buildCostReasonBullets(input: {
  mode: SolunaCostMode;
  monthlyCostUsd: number;
  usageRatio: number;
  monthlyTokens: number;
  tokenLimit: number;
  economyUsd: number;
  minimalUsd: number;
  economyRatio: number;
  minimalRatio: number;
}): { reason: string; reasonBullets: string[] } {
  const {
    mode,
    monthlyCostUsd,
    usageRatio,
    monthlyTokens,
    tokenLimit,
    economyUsd,
    minimalUsd,
    economyRatio,
    minimalRatio,
  } = input;

  const usageLine =
    tokenLimit > 0
      ? `今月の AI 利用量: ${monthlyTokens.toLocaleString("ja-JP")} / ${tokenLimit.toLocaleString("ja-JP")} tokens（${formatPct(usageRatio)}）`
      : `今月の AI 利用量: ${monthlyTokens.toLocaleString("ja-JP")} tokens`;
  const costLine = `今月の推定 AI コスト: ${formatUsd(monthlyCostUsd)}（目安）`;

  if (mode === "minimal") {
    return {
      reason: "今月の利用が多いため、軽量モデル優先モードです",
      reasonBullets: [
        "いまは「節約モード（軽量モデル優先）」です。",
        costLine,
        usageLine,
        `節約に切り替える目安: コスト ${formatUsd(minimalUsd)} 以上、または利用 ${formatPct(minimalRatio)} 以上。`,
        "高いモデルより安いモデルを優先し、会話品質よりコスト抑制を優先します。",
        "来月（または利用が落ち着いたら）自動で通常モードに戻ります。",
      ],
    };
  }

  if (mode === "economy") {
    return {
      reason: "コスト調整のため、やや軽いモデルを選んでいます",
      reasonBullets: [
        "いまは「コスト調整モード」です。",
        costLine,
        usageLine,
        `調整開始の目安: コスト ${formatUsd(economyUsd)} 以上、または利用 ${formatPct(economyRatio)} 以上。`,
        "最新の重いモデルは抑えめにし、バランスの良いモデルを選びます。",
        `さらに増えると（約 ${formatUsd(minimalUsd)} / 利用 ${formatPct(minimalRatio)}）完全な節約モードになります。`,
      ],
    };
  }

  return {
    reason: "最新モデルを優先",
    reasonBullets: [
      "いまは「通常モード」です。品質優先でモデルを選びます。",
      costLine,
      usageLine,
      `コストが約 ${formatUsd(economyUsd)}、または利用が ${formatPct(economyRatio)} を超えると自動でコスト調整に入ります。`,
      "Soluna の会話・画像などの AI 利用が、この投資判断の対象です。",
    ],
  };
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

  let mode: SolunaCostMode = "normal";
  if (monthlyCostUsd >= minimalUsd || usageRatio >= minimalRatio) {
    mode = "minimal";
  } else if (monthlyCostUsd >= economyUsd || usageRatio >= economyRatio) {
    mode = "economy";
  }

  const { reason, reasonBullets } = buildCostReasonBullets({
    mode,
    monthlyCostUsd,
    usageRatio,
    monthlyTokens: quota.used,
    tokenLimit: quota.limit,
    economyUsd,
    minimalUsd,
    economyRatio,
    minimalRatio,
  });

  const value: SolunaCostAssessment = {
    mode,
    monthlyCostUsd,
    monthlyTokens: quota.used,
    tokenLimit: quota.limit,
    usageRatio,
    reason,
    reasonBullets,
  };

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
