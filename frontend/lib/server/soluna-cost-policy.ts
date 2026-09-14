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
  /** UI 向け：なぜこの投資配分（モデル選択）にしたかの解説文 */
  reasonDetail: string;
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

function buildCostCopy(input: {
  mode: SolunaCostMode;
  monthlyCostUsd: number;
  usageRatio: number;
  monthlyTokens: number;
  tokenLimit: number;
  economyUsd: number;
  minimalUsd: number;
  economyRatio: number;
  minimalRatio: number;
}): { reason: string; reasonBullets: string[]; reasonDetail: string } {
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
      reasonDetail: `Soluna の会話・画像などに使う AI は、従量課金です。今月は推定 ${formatUsd(monthlyCostUsd)}、利用 ${formatPct(usageRatio)} に達しているため、意図的に「節約モード」へ切り替えています。これはサービスを止めるのではなく、より軽いモデルへ寄せて残高と月次上限を守る投資判断です。閾値はコスト約 ${formatUsd(minimalUsd)}、または利用 ${formatPct(minimalRatio)} です。利用が落ち着けば、次の請求期間では自動的に通常の品質優先へ戻ります。`,
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
      reasonDetail: `いまの推定 AI コストは ${formatUsd(monthlyCostUsd)}、利用は ${formatPct(usageRatio)} です。品質は維持しつつ、いちばん高いモデルの使用頻度を下げています（コスト調整モード）。これは「使いすぎの手前でハンドルを切る」ための投資判断で、閾値はコスト約 ${formatUsd(economyUsd)} または利用 ${formatPct(economyRatio)} です。このまま増えると節約モード（約 ${formatUsd(minimalUsd)} / ${formatPct(minimalRatio)}）へ進み、さらに軽いモデルへ寄せます。`,
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
    reasonDetail: `現在は通常モードです。推定コスト ${formatUsd(monthlyCostUsd)}・利用 ${formatPct(usageRatio)} の範囲では、会話の分かりやすさや応答品質を優先してモデルを選んでいます。AI 利用は従量のため、コストが約 ${formatUsd(economyUsd)}、または利用が ${formatPct(economyRatio)} を超えると自動でコスト調整モードへ移り、重いモデルの比率を下げます。止めずに使い続けられるよう、閾値ベースで配分しています。`,
  };
}

/** 月間コスト・トークン使用率から Soluna のモデル tier を調整 */
export async function assessSolunaCostMode(userId: string): Promise<SolunaCostAssessment> {
  const cached = assessmentCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

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

  const { reason, reasonBullets, reasonDetail } = buildCostCopy({
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
    reasonDetail,
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
