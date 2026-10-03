/**
 * 買いシグナルの強さ（監視メモがアクティブより好条件かの比較用）。
 * 従来トレンド買い > 安値ゾーン。数値が高いほど優先。
 */
export function stockBuySignalPriority(advice: {
  action?: string;
  trend?: string;
  dipBuyEligible?: boolean;
  dipScore?: number;
}): number {
  let priority = 0;
  if (advice.action === "buy" && advice.trend === "bullish") {
    priority = Math.max(priority, 1000 + Math.max(0, advice.dipScore ?? 0));
  }
  if (advice.dipBuyEligible) {
    priority = Math.max(priority, 100 + Math.max(0, advice.dipScore ?? 0));
  }
  return priority;
}

/** 監視メモ買い: アクティブ最良より厳密に上回るときだけ許可 */
export function isMemoBuyBetterThanActive(
  memoPriority: number,
  bestActivePriority: number,
): boolean {
  return memoPriority > bestActivePriority;
}
