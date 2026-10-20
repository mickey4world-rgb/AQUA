/**
 * 日本株の売り方針（仮想通貨 Soluna と同型）。
 * - 利確: プラス圏のみ（短期でも可）
 * - 損切り: 保有1年未満は禁止。1年超かつ深い含み損のみ例外
 * - 「買ってすぐ赤字で売る」は禁止
 */
import {
  STOCK_HARD_STOP_LOSS_RATE,
  STOCK_SOFT_STOP_LOSS_RATE,
} from "@/lib/stock-trade-constants";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

/** 損切りを検討できる最短保有（仮想通貨と同じ 1 年） */
export const STOCK_STOP_LOSS_MIN_HOLD_MS = 365 * 24 * 60 * 60 * 1000;

/** 1年超後の硬損切り率（Soluna HARD_STOP に合わせる） */
export const STOCK_STOP_LOSS_AFTER_YEAR_HARD_RATE = -0.25;

/** 1年超後の軟損切り率 */
export const STOCK_STOP_LOSS_AFTER_YEAR_SOFT_RATE = -0.15;

/**
 * 利確に必要な最低含み益率（ざらつき・手数料で実質赤字の「微プラス売り」を防ぐ）。
 */
export const STOCK_MIN_TAKE_PROFIT_RATE = 0.005;

export type StockSellDecision = {
  sell: true;
  kind: "take-profit" | "stop-loss";
  reason: string;
  ruleIds: number[];
};

/**
 * 当該銘柄の最初の LIVE/dry-run 買い時刻。不明なら null（＝1年未満扱い＝損切り禁止）。
 */
export function earliestStockBuyAtMs(
  orders: StockBrokerOrderRecord[],
  symbol: string,
): number | null {
  let min: number | null = null;
  for (const o of orders) {
    if (o.side !== "buy") continue;
    if (o.symbol !== symbol) continue;
    if (o.status !== "submitted" && o.status !== "dry_run") continue;
    const t = Date.parse(o.createdAt);
    if (!Number.isFinite(t)) continue;
    if (min == null || t < min) min = t;
  }
  return min;
}

export function stockHoldMs(
  orders: StockBrokerOrderRecord[],
  symbol: string,
  nowMs = Date.now(),
): number | null {
  const boughtAt = earliestStockBuyAtMs(orders, symbol);
  if (boughtAt == null) return null;
  return Math.max(0, nowMs - boughtAt);
}

export function decideStockSellIntent(input: {
  symbol: string;
  buyPrice: number;
  currentPrice: number;
  adviceAction: string;
  targetPrice: number;
  preferEarlierTakeProfit: boolean;
  orders: StockBrokerOrderRecord[];
  nowMs?: number;
}): StockSellDecision | null {
  const nowMs = input.nowMs ?? Date.now();
  const buy = input.buyPrice;
  const px = input.currentPrice;
  if (!(buy > 0) || !(px > 0)) return null;

  const changeRate = (px - buy) / buy;
  const holdMs = stockHoldMs(input.orders, input.symbol, nowMs);
  const holdLabel =
    holdMs == null
      ? "保有期間不明→1年未満扱い"
      : `保有${Math.floor(holdMs / (24 * 60 * 60 * 1000))}日`;
  const withinYear =
    holdMs == null || holdMs < STOCK_STOP_LOSS_MIN_HOLD_MS;

  // --- 利確: 実質プラス圏のみ（微プラスの即売りで手数料負けしない）---
  if (changeRate >= STOCK_MIN_TAKE_PROFIT_RATE) {
    const hitTarget =
      input.targetPrice > 0 && px >= input.targetPrice;
    const earlyTp =
      input.preferEarlierTakeProfit &&
      input.targetPrice > 0 &&
      px >= input.targetPrice * 0.95;
    const aiSell = input.adviceAction === "sell";

    if (hitTarget || earlyTp || aiSell) {
      const ruleIds = hitTarget
        ? [1, 11, 12, 13, 14, 15, 19, 20, 23, 26]
        : [1, 12, 13, 14, 15, 19, 20, 23, 47];
      if (input.preferEarlierTakeProfit) ruleIds.push(24);
      return {
        sell: true,
        kind: "take-profit",
        reason: hitTarget
          ? `利確: 目標到達 +${(changeRate * 100).toFixed(1)}%（${holdLabel}）`
          : earlyTp
            ? `利確: 目標手前の早期利確 +${(changeRate * 100).toFixed(1)}%（${holdLabel}）`
            : `利確: プラス圏のAI売り +${(changeRate * 100).toFixed(1)}%（${holdLabel}）`,
        ruleIds,
      };
    }
    return null;
  }

  // --- 含み損 / トントン: 1年未満は絶対に売らない ---
  if (withinYear) {
    return null;
  }

  // 1年超: 深い含み損のみ（Soluna 同型）。旧 -8% 即損切りは廃止。
  if (changeRate <= STOCK_STOP_LOSS_AFTER_YEAR_HARD_RATE) {
    return {
      sell: true,
      kind: "stop-loss",
      reason: `1年超保有後の硬損切り ${(changeRate * 100).toFixed(1)}%（${holdLabel}）`,
      ruleIds: [1, 13, 14, 15, 25, 47],
    };
  }

  if (
    changeRate <= STOCK_STOP_LOSS_AFTER_YEAR_SOFT_RATE &&
    (input.adviceAction === "sell" ||
      changeRate <= STOCK_SOFT_STOP_LOSS_RATE)
  ) {
    return {
      sell: true,
      kind: "stop-loss",
      reason: `1年超・下落継続の損切り ${(changeRate * 100).toFixed(1)}%（${holdLabel}）`,
      ruleIds: [1, 13, 14, 15, 26, 47],
    };
  }

  // 旧ハード -8% は建玉サイジング用のまま残すが、売りトリガには使わない
  void STOCK_HARD_STOP_LOSS_RATE;
  return null;
}
