/**
 * 日本株 Costs 用 — 仮想通貨 Soluna と同型の概要・銘柄利確目安。
 */
import {
  STOCK_HARD_TAKE_PROFIT_MULT,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PRINCIPAL_YEN,
} from "@/lib/stock-trade-constants";
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import type { StockEquityPerformance } from "@/lib/stock-equity-performance";
import type { StockWatch } from "@/lib/types/stock";
import { displayTicker } from "@/lib/stock-utils";

/** 軟利確の表示用（早期利確の目安。硬は目標×1.2 またはウォッチ目標） */
export const STOCK_SOFT_TAKE_PROFIT_RATE = 0.05;

export type StockPortfolioOverview = {
  totalYen: number;
  holdingsValueYen: number;
  cashYen: number;
  cashAllocationPct: number;
  realizedPnlYen: number;
  realizedBaseYen: number;
  realizedPnlPct: number;
  monthlyRealizedPnlYen: number;
  monthlyTargetYen: number;
  targetProgressPct: number;
  principalYen: number;
};

export type StockProductProjection = {
  symbol: string;
  label: string;
  heldQty: number;
  priceYen: number;
  avgBuyPriceYen: number;
  avgBuyEstimated: boolean;
  targetSellSoftYen: number;
  targetSellHardYen: number;
  expectedProfitSoftYen: number;
  expectedProfitHardYen: number;
  unrealizedPnlYen: number;
};

function avgBuyFromOrders(
  orders: StockBrokerOrderRecord[],
  symbol: string,
): number | null {
  const buys = orders.filter(
    (o) =>
      o.symbol === symbol &&
      o.side === "buy" &&
      (o.status === "submitted" || o.status === "dry_run") &&
      typeof o.priceYen === "number" &&
      o.priceYen > 0,
  );
  if (buys.length === 0) return null;
  let qty = 0;
  let notional = 0;
  for (const b of buys) {
    qty += b.qty;
    notional += b.priceYen! * b.qty;
  }
  return qty > 0 ? notional / qty : null;
}

export function buildStockPortfolioOverview(input: {
  snapshot: StockBrokerSnapshot | null;
  equity: StockEquityPerformance | null;
  monthlyTargetYen?: number;
  principalYen?: number;
}): StockPortfolioOverview {
  const principal = input.principalYen ?? STOCK_PRINCIPAL_YEN;
  const monthlyTarget =
    input.monthlyTargetYen ?? STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN;
  const cashYen = Math.round(input.snapshot?.cash.stockAccountWallet ?? 0);
  const holdingsValueYen = Math.round(
    (input.snapshot?.holdings ?? []).reduce(
      (s, h) => s + Math.max(0, h.qty) * Math.max(0, h.price),
      0,
    ),
  );
  const totalYen = cashYen + holdingsValueYen;
  const realizedPnlYen = input.equity?.pnlYen ?? 0;
  const monthlyRealizedPnlYen = input.equity?.monthlyRealizedPnlYen ?? 0;
  const targetProgressPct =
    monthlyTarget > 0 ? (monthlyRealizedPnlYen / monthlyTarget) * 100 : 0;

  return {
    totalYen,
    holdingsValueYen,
    cashYen,
    cashAllocationPct: totalYen > 0 ? (cashYen / totalYen) * 100 : 0,
    realizedPnlYen,
    realizedBaseYen: input.equity?.currentTotalYen ?? principal + realizedPnlYen,
    realizedPnlPct:
      input.equity?.pnlPct ??
      (principal > 0 ? (realizedPnlYen / principal) * 100 : 0),
    monthlyRealizedPnlYen,
    monthlyTargetYen: monthlyTarget,
    targetProgressPct,
    principalYen: principal,
  };
}

export function buildStockProductProjections(input: {
  snapshot: StockBrokerSnapshot | null;
  watches: StockWatch[];
  orders: StockBrokerOrderRecord[];
}): StockProductProjection[] {
  const holdings = (input.snapshot?.holdings ?? []).filter((h) => h.qty > 0);
  const watchByCode = new Map(
    input.watches
      .filter((w) => (w.market ?? "us") === "jp")
      .map((w) => [displayTicker(w.ticker, "jp"), w] as const),
  );

  return holdings
    .map((h) => {
      const watch = watchByCode.get(h.symbol);
      const fromBroker =
        h.averagePrice && h.averagePrice > 0 ? h.averagePrice : null;
      const fromWatch =
        watch && watch.buyPrice > 0 ? watch.buyPrice : null;
      const fromOrders = avgBuyFromOrders(input.orders, h.symbol);
      let avgBuyPriceYen = fromBroker ?? fromOrders ?? fromWatch ?? 0;
      let avgBuyEstimated = false;
      if (!(avgBuyPriceYen > 0) && h.price > 0) {
        avgBuyPriceYen = h.price;
        avgBuyEstimated = true;
      }
      if (!(avgBuyPriceYen > 0)) return null;

      const hardFromWatch =
        watch && watch.targetPrice > 0 ? watch.targetPrice : null;
      const targetSellHardYen = Math.round(
        hardFromWatch ?? avgBuyPriceYen * STOCK_HARD_TAKE_PROFIT_MULT,
      );
      const softFromEarly =
        hardFromWatch != null ? Math.round(hardFromWatch * 0.95) : null;
      const targetSellSoftYen = Math.round(
        softFromEarly ??
          avgBuyPriceYen * (1 + STOCK_SOFT_TAKE_PROFIT_RATE),
      );
      const qty = h.qty;
      const priceYen = h.price > 0 ? h.price : avgBuyPriceYen;

      return {
        symbol: h.symbol,
        label: h.symbolName || watch?.name || h.symbol,
        heldQty: qty,
        priceYen,
        avgBuyPriceYen,
        avgBuyEstimated,
        targetSellSoftYen,
        targetSellHardYen,
        expectedProfitSoftYen: Math.round(
          (targetSellSoftYen - avgBuyPriceYen) * qty,
        ),
        expectedProfitHardYen: Math.round(
          (targetSellHardYen - avgBuyPriceYen) * qty,
        ),
        unrealizedPnlYen: Math.round((priceYen - avgBuyPriceYen) * qty),
      } satisfies StockProductProjection;
    })
    .filter((p): p is StockProductProjection => p != null)
    .sort((a, b) => b.heldQty * b.priceYen - a.heldQty * a.priceYen);
}
