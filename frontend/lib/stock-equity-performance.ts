/**
 * 日本株自動運用 — 元本対比の実現損益折れ線（Soluna と同型）
 * 線 = 元本 + 累積実現損益（含みは載せない）。買いマーカーは線を動かさない。
 */
import {
  STOCK_MAX_EQUITY_POINTS,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PRINCIPAL_YEN,
} from "@/lib/stock-trade-constants";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

export interface StockEquityPoint {
  date: string;
  label: string;
  totalYen: number;
  pnlYen: number;
  monthGoalTotalYen: number;
  buyYen: number;
  sellYen: number;
  tradeCount: number;
}

export interface StockEquityMarker {
  id: string;
  date: string;
  at: string;
  side: "buy" | "sell";
  symbol: string;
  sizeJpy: number;
  realizedPnlJpy?: number;
  totalYen: number;
}

export interface StockEquityPerformance {
  principalYen: number;
  monthlyTargetYen: number;
  currentTotalYen: number;
  pnlYen: number;
  pnlPct: number;
  monthlyRealizedPnlYen: number;
  monthlyProgressPct: number;
  points: StockEquityPoint[];
  markers: StockEquityMarker[];
}

function jstDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function dateLabelJa(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}/${d}`;
}

function jstMonthPrefix(iso: string): string {
  return jstDateKey(iso).slice(0, 7);
}

/** orders から実現損益概算（sell の realizedPnlYen、無ければ 0） */
export function buildStockEquityPerformance(input: {
  orders: StockBrokerOrderRecord[];
  principalYen?: number;
  monthlyTargetYen?: number;
  nowIso?: string;
}): StockEquityPerformance {
  const principal = input.principalYen ?? STOCK_PRINCIPAL_YEN;
  const monthlyTarget =
    input.monthlyTargetYen ?? STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const month = jstMonthPrefix(nowIso);

  const trades = [...input.orders]
    .filter((o) => o.status === "dry_run" || o.status === "submitted")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  let cumPnl = 0;
  const byDate = new Map<string, StockEquityPoint>();
  const markers: StockEquityMarker[] = [];

  const seedDate =
    trades[0] != null ? jstDateKey(trades[0].createdAt) : jstDateKey(nowIso);
  byDate.set(seedDate, {
    date: seedDate,
    label: dateLabelJa(seedDate),
    totalYen: principal,
    pnlYen: 0,
    monthGoalTotalYen: principal + monthlyTarget,
    buyYen: 0,
    sellYen: 0,
    tradeCount: 0,
  });

  for (const o of trades) {
    const date = jstDateKey(o.createdAt);
    const sizeJpy = Math.max(0, o.qty) * 1000; // 単価不明時の軽量マーカー用
    const realized =
      o.side === "sell" ? Number(o.realizedPnlYen ?? 0) || 0 : 0;
    if (o.side === "sell") cumPnl += realized;

    const prev =
      byDate.get(date) ??
      (() => {
        const last = [...byDate.values()].at(-1);
        return {
          date,
          label: dateLabelJa(date),
          totalYen: last?.totalYen ?? principal,
          pnlYen: last?.pnlYen ?? 0,
          monthGoalTotalYen: principal + monthlyTarget,
          buyYen: 0,
          sellYen: 0,
          tradeCount: 0,
        } satisfies StockEquityPoint;
      })();

    const next: StockEquityPoint = {
      ...prev,
      totalYen: Math.round(principal + cumPnl),
      pnlYen: Math.round(cumPnl),
      buyYen: prev.buyYen + (o.side === "buy" ? sizeJpy : 0),
      sellYen: prev.sellYen + (o.side === "sell" ? sizeJpy : 0),
      tradeCount: prev.tradeCount + 1,
    };
    byDate.set(date, next);

    markers.push({
      id: o.id,
      date,
      at: o.createdAt,
      side: o.side,
      symbol: o.symbol,
      sizeJpy,
      realizedPnlJpy: o.side === "sell" ? realized : undefined,
      totalYen: next.totalYen,
    });
  }

  // 今日まで線を伸ばす
  const today = jstDateKey(nowIso);
  if (!byDate.has(today)) {
    const last = [...byDate.values()].at(-1);
    byDate.set(today, {
      date: today,
      label: dateLabelJa(today),
      totalYen: Math.round(principal + cumPnl),
      pnlYen: Math.round(cumPnl),
      monthGoalTotalYen: principal + monthlyTarget,
      buyYen: 0,
      sellYen: 0,
      tradeCount: 0,
      ...(last
        ? {
            totalYen: last.totalYen,
            pnlYen: last.pnlYen,
          }
        : {}),
    });
  }

  const points = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-STOCK_MAX_EQUITY_POINTS);

  const monthlyRealizedPnlYen = trades
    .filter(
      (o) =>
        o.side === "sell" && jstMonthPrefix(o.createdAt) === month,
    )
    .reduce((s, o) => s + (Number(o.realizedPnlYen ?? 0) || 0), 0);

  const pnlYen = Math.round(cumPnl);
  return {
    principalYen: principal,
    monthlyTargetYen: monthlyTarget,
    currentTotalYen: Math.round(principal + cumPnl),
    pnlYen,
    pnlPct: principal > 0 ? (pnlYen / principal) * 100 : 0,
    monthlyRealizedPnlYen: Math.round(monthlyRealizedPnlYen),
    monthlyProgressPct:
      monthlyTarget > 0
        ? (monthlyRealizedPnlYen / monthlyTarget) * 100
        : 0,
    points,
    markers: markers.slice(-80),
  };
}
