/**
 * 買いシグナルの強さ（監視メモがアクティブより好条件かの比較用）。
 * 従来トレンド買い > 安値ゾーン。数値が高いほど優先。
 */
import { STOCK_MEMO_CORE_PRIORITY_SLACK } from "@/lib/stock-trade-constants";
import { isBearishDipBounceBuy } from "@/lib/stock-buy-eligibility";

export function stockBuySignalPriority(advice: {
  action?: string;
  trend?: string;
  dipBuyEligible?: boolean;
  dipScore?: number;
  rsi14?: number;
  nearWeekLow?: boolean;
  nearMonthLow?: boolean;
}): number {
  let priority = 0;
  if (advice.action === "buy" && advice.trend === "bullish") {
    priority = Math.max(priority, 1000 + Math.max(0, advice.dipScore ?? 0));
  }
  // hold+強気+安値（Path A 活性化）は buy+強気より少し低く
  if (
    advice.action === "hold" &&
    advice.trend === "bullish" &&
    (advice.rsi14 ?? 100) <= 40 &&
    (advice.nearWeekLow || advice.nearMonthLow || advice.dipBuyEligible)
  ) {
    priority = Math.max(priority, 850 + Math.max(0, advice.dipScore ?? 0));
  }
  // #8 部分解禁（下降+売られすぎ+安値）はトレンド買いより少し低く、安値枠より高く
  if (isBearishDipBounceBuy(advice)) {
    priority = Math.max(priority, 500 + Math.max(0, advice.dipScore ?? 0));
  }
  if (advice.dipBuyEligible) {
    priority = Math.max(priority, 100 + Math.max(0, advice.dipScore ?? 0));
  }
  return priority;
}

/** 監視メモ買い: 通常は厳密に上回る。コアは slack 以内なら可 (#45緩和) */
export function isMemoBuyBetterThanActive(
  memoPriority: number,
  bestActivePriority: number,
  opts?: { isCore?: boolean },
): boolean {
  if (opts?.isCore) {
    return memoPriority >= bestActivePriority - STOCK_MEMO_CORE_PRIORITY_SLACK;
  }
  return memoPriority > bestActivePriority;
}
