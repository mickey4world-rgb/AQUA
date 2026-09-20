/**
 * 資産運用の総資産推移（折れ線）を台帳・取引から組み立てる（クライアント可）
 */
import {
  ASSET_PRINCIPAL_YEN,
  ASSET_START_MONTH,
  MAX_EQUITY_SNAPSHOTS,
} from "@/lib/soluna-asset-trade-constants";
import type {
  SolunaAssetLedger,
  SolunaEquitySnapshot,
  SolunaMonthlyAssetSummary,
  SolunaTradeRecord,
} from "@/lib/types/soluna";

export type SolunaEquityRange = "daily" | "weekly";

export interface SolunaEquityPoint {
  /** JST YYYY-MM-DD（週次は週の最終日） */
  date: string;
  label: string;
  totalYen: number;
  cashYen: number;
  pnlYen: number;
  monthGoalTotalYen: number;
  buyYen: number;
  sellYen: number;
  tradeCount: number;
  /** snapshot | month-open | trade-approx | live | seed */
  source: string;
}

export interface SolunaEquityTradeMarker {
  id: string;
  date: string;
  at: string;
  side: "BUY" | "SELL";
  product: string;
  sizeJpy: number;
  realizedPnlJpy?: number;
  /** マーカーの Y 位置（その時点の概算総資産） */
  totalYen: number;
}

export interface SolunaEquityPerformance {
  principalYen: number;
  startDate: string;
  currentTotalYen: number;
  currentCashYen: number;
  pnlYen: number;
  pnlPct: number;
  monthlyTargetYen: number;
  monthGoalTotalYen: number;
  monthlyRealizedPnlYen: number;
  points: SolunaEquityPoint[];
  weeklyPoints: SolunaEquityPoint[];
  markers: SolunaEquityTradeMarker[];
}

/** JST の YYYY-MM-DD */
export function jstDateKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateLabelJa(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}/${d}`;
}

function weekEndDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  // JST 日付文字列を月曜始まりの週の日曜（週末）へ
  const dow = utc.getUTCDay(); // 0=Sun
  const add = dow === 0 ? 0 : 7 - dow;
  utc.setUTCDate(utc.getUTCDate() + add);
  return utc.toISOString().slice(0, 10);
}

function weekLabelJa(weekEnd: string): string {
  const start = (() => {
    const [y, m, d] = weekEnd.split("-").map(Number);
    const utc = new Date(Date.UTC(y!, m! - 1, d! - 6));
    return utc.toISOString().slice(0, 10);
  })();
  return `${dateLabelJa(start)}–${dateLabelJa(weekEnd)}`;
}

/**
 * 約定を反映して同日スナップショットを更新／追加する。
 */
export function appendEquitySnapshot(
  ledger: SolunaAssetLedger,
  executedTrades: SolunaTradeRecord[] = [],
): SolunaAssetLedger {
  const principal = ledger.principalYen || ASSET_PRINCIPAL_YEN;
  const at = ledger.updatedAt || new Date().toISOString();
  const date = jstDateKey(at);
  const monthOpening = ledger.lastMonthTotalYen || principal;
  const buyYen = executedTrades
    .filter((t) => t.side === "BUY")
    .reduce((s, t) => s + (t.sizeJpy ?? 0), 0);
  const sellYen = executedTrades
    .filter((t) => t.side === "SELL")
    .reduce((s, t) => s + (t.sizeJpy ?? 0), 0);
  const tradeCount = executedTrades.length;

  const prev = [...(ledger.equitySnapshots ?? [])];
  const last = prev[prev.length - 1];
  const sameDay = last?.date === date;

  const point: SolunaEquitySnapshot = {
    date,
    at,
    totalYen: Math.round(ledger.totalYen),
    cashYen: Math.round(ledger.cashYen),
    pnlYen: Math.round(ledger.totalYen - principal),
    monthlyTargetYen: Math.round(ledger.monthlyTargetYen ?? 0),
    monthGoalTotalYen: Math.round(monthOpening + (ledger.monthlyTargetYen ?? 0)),
    buyYen: (sameDay ? (last?.buyYen ?? 0) : 0) + buyYen,
    sellYen: (sameDay ? (last?.sellYen ?? 0) : 0) + sellYen,
    tradeCount: (sameDay ? (last?.tradeCount ?? 0) : 0) + tradeCount,
  };

  if (sameDay) prev[prev.length - 1] = point;
  else prev.push(point);

  return {
    ...ledger,
    equitySnapshots: prev.slice(-MAX_EQUITY_SNAPSHOTS),
  };
}

type MutablePoint = SolunaEquityPoint;

function upsertPoint(
  map: Map<string, MutablePoint>,
  partial: Omit<MutablePoint, "label"> & { label?: string },
): void {
  const existing = map.get(partial.date);
  const next: MutablePoint = {
    date: partial.date,
    label: partial.label ?? dateLabelJa(partial.date),
    totalYen: partial.totalYen,
    cashYen: partial.cashYen,
    pnlYen: partial.pnlYen,
    monthGoalTotalYen: partial.monthGoalTotalYen,
    buyYen: partial.buyYen,
    sellYen: partial.sellYen,
    tradeCount: partial.tradeCount,
    source: partial.source,
  };
  if (!existing) {
    map.set(partial.date, next);
    return;
  }
  // 優先度: live/snapshot > trade-approx > month-open > seed
  const rank = (s: string) =>
    s === "live" || s === "snapshot" ? 4 : s === "trade-approx" ? 3 : s === "month-open" ? 2 : 1;
  if (rank(partial.source) >= rank(existing.source)) {
    map.set(partial.date, {
      ...next,
      buyYen: Math.max(existing.buyYen, next.buyYen),
      sellYen: Math.max(existing.sellYen, next.sellYen),
      tradeCount: Math.max(existing.tradeCount, next.tradeCount),
    });
  } else {
    map.set(partial.date, {
      ...existing,
      buyYen: existing.buyYen + (partial.source === "trade-approx" ? next.buyYen : 0),
      sellYen: existing.sellYen + (partial.source === "trade-approx" ? next.sellYen : 0),
      tradeCount:
        existing.tradeCount + (partial.source === "trade-approx" ? next.tradeCount : 0),
    });
  }
}

/**
 * 残っている約定から現金＋簿価ベースの概算総資産を日次で復元する。
 * （時価履歴が無いため、含み損益は約定時点の簿価近似）
 */
function approximateFromTrades(
  principal: number,
  trades: SolunaTradeRecord[],
  monthGoalForDate: (date: string) => number,
): MutablePoint[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let cash = principal;
  let cryptoCost = 0;
  const byDate = new Map<string, MutablePoint>();

  for (const t of sorted) {
    const date = jstDateKey(t.createdAt);
    if (t.side === "BUY") {
      cash -= t.sizeJpy ?? 0;
      cryptoCost += t.sizeJpy ?? 0;
    } else {
      const proceeds = t.sizeJpy ?? 0;
      const pnl = t.realizedPnlJpy ?? 0;
      cash += proceeds;
      cryptoCost = Math.max(0, cryptoCost - (proceeds - pnl));
    }
    const total = Math.round(Math.max(0, cash) + Math.max(0, cryptoCost));
    const prev = byDate.get(date);
    byDate.set(date, {
      date,
      label: dateLabelJa(date),
      totalYen: total,
      cashYen: Math.round(Math.max(0, cash)),
      pnlYen: total - principal,
      monthGoalTotalYen: monthGoalForDate(date),
      buyYen: (prev?.buyYen ?? 0) + (t.side === "BUY" ? t.sizeJpy ?? 0 : 0),
      sellYen: (prev?.sellYen ?? 0) + (t.side === "SELL" ? t.sizeJpy ?? 0 : 0),
      tradeCount: (prev?.tradeCount ?? 0) + 1,
      source: "trade-approx",
    });
  }
  return [...byDate.values()];
}

function rollupWeekly(points: SolunaEquityPoint[]): SolunaEquityPoint[] {
  const weeks = new Map<string, SolunaEquityPoint>();
  for (const p of points) {
    const end = weekEndDateKey(p.date);
    const prev = weeks.get(end);
    if (!prev) {
      weeks.set(end, {
        ...p,
        date: end,
        label: weekLabelJa(end),
      });
      continue;
    }
    weeks.set(end, {
      date: end,
      label: weekLabelJa(end),
      totalYen: p.totalYen,
      cashYen: p.cashYen,
      pnlYen: p.pnlYen,
      monthGoalTotalYen: p.monthGoalTotalYen,
      buyYen: prev.buyYen + p.buyYen,
      sellYen: prev.sellYen + p.sellYen,
      tradeCount: prev.tradeCount + p.tradeCount,
      source: p.source,
    });
  }
  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildEquityPerformance(input: {
  principalYen?: number;
  totalYen: number;
  cashYen: number;
  monthlyTargetYen: number;
  lastMonthTotalYen?: number;
  monthlyRealizedPnlYen?: number;
  monthlySummaries?: SolunaMonthlyAssetSummary[];
  equitySnapshots?: SolunaEquitySnapshot[];
  trades?: SolunaTradeRecord[];
  now?: Date;
}): SolunaEquityPerformance {
  const principal = input.principalYen || ASSET_PRINCIPAL_YEN;
  const summaries = input.monthlySummaries ?? [];
  const startMonth =
    summaries[0]?.month && summaries[0].month < ASSET_START_MONTH
      ? summaries[0].month
      : ASSET_START_MONTH;
  const startDate = `${startMonth}-01`;
  const today = jstDateKey(input.now ?? new Date());
  const monthOpening = input.lastMonthTotalYen || principal;
  const monthGoalTotalYen = Math.round(monthOpening + (input.monthlyTargetYen || 0));

  const goalByMonth = new Map<string, number>();
  for (const m of summaries) {
    goalByMonth.set(m.month, Math.round(m.openingBalanceYen + m.targetProfitYen));
  }
  const currentMonth = today.slice(0, 7);
  if (!goalByMonth.has(currentMonth)) {
    goalByMonth.set(currentMonth, monthGoalTotalYen);
  }
  const monthGoalForDate = (date: string) =>
    goalByMonth.get(date.slice(0, 7)) ?? monthGoalTotalYen;

  const map = new Map<string, MutablePoint>();

  upsertPoint(map, {
    date: startDate,
    totalYen: principal,
    cashYen: principal,
    pnlYen: 0,
    monthGoalTotalYen: monthGoalForDate(startDate),
    buyYen: 0,
    sellYen: 0,
    tradeCount: 0,
    source: "seed",
  });

  for (const m of summaries) {
    const date = `${m.month}-01`;
    upsertPoint(map, {
      date,
      totalYen: Math.round(m.openingBalanceYen),
      cashYen: Math.round(m.openingBalanceYen),
      pnlYen: Math.round(m.openingBalanceYen - principal),
      monthGoalTotalYen: Math.round(m.openingBalanceYen + m.targetProfitYen),
      buyYen: 0,
      sellYen: 0,
      tradeCount: 0,
      source: "month-open",
    });
  }

  for (const p of approximateFromTrades(principal, input.trades ?? [], monthGoalForDate)) {
    upsertPoint(map, p);
  }

  for (const s of input.equitySnapshots ?? []) {
    upsertPoint(map, {
      date: s.date,
      totalYen: Math.round(s.totalYen),
      cashYen: Math.round(s.cashYen),
      pnlYen: Math.round(s.pnlYen),
      monthGoalTotalYen: Math.round(s.monthGoalTotalYen),
      buyYen: s.buyYen ?? 0,
      sellYen: s.sellYen ?? 0,
      tradeCount: s.tradeCount ?? 0,
      source: "snapshot",
    });
  }

  upsertPoint(map, {
    date: today,
    totalYen: Math.round(input.totalYen),
    cashYen: Math.round(input.cashYen),
    pnlYen: Math.round(input.totalYen - principal),
    monthGoalTotalYen,
    buyYen: 0,
    sellYen: 0,
    tradeCount: 0,
    source: "live",
  });

  const points = [...map.values()]
    .filter((p) => p.date >= startDate && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  // マーカー用: 取引時点の概算総資産（直前ポイント or 復元）
  const totalByDate = new Map(points.map((p) => [p.date, p.totalYen]));
  let walkCash = principal;
  let walkCost = 0;
  const sortedTrades = [...(input.trades ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const markers: SolunaEquityTradeMarker[] = [];
  for (const t of sortedTrades) {
    if (t.side === "BUY") {
      walkCash -= t.sizeJpy ?? 0;
      walkCost += t.sizeJpy ?? 0;
    } else {
      const proceeds = t.sizeJpy ?? 0;
      const pnl = t.realizedPnlJpy ?? 0;
      walkCash += proceeds;
      walkCost = Math.max(0, walkCost - (proceeds - pnl));
    }
    const date = jstDateKey(t.createdAt);
    const approx = Math.round(Math.max(0, walkCash) + Math.max(0, walkCost));
    markers.push({
      id: t.id,
      date,
      at: t.createdAt,
      side: t.side,
      product: (t.product ?? "BTC_JPY").replace("_JPY", ""),
      sizeJpy: t.sizeJpy ?? 0,
      realizedPnlJpy: t.realizedPnlJpy,
      totalYen: totalByDate.get(date) ?? approx,
    });
  }

  const pnlYen = Math.round(input.totalYen - principal);
  return {
    principalYen: principal,
    startDate,
    currentTotalYen: Math.round(input.totalYen),
    currentCashYen: Math.round(input.cashYen),
    pnlYen,
    pnlPct: principal > 0 ? Math.round((pnlYen / principal) * 1000) / 10 : 0,
    monthlyTargetYen: Math.round(input.monthlyTargetYen || 0),
    monthGoalTotalYen,
    monthlyRealizedPnlYen: Math.round(input.monthlyRealizedPnlYen ?? 0),
    points,
    weeklyPoints: rollupWeekly(points),
    markers,
  };
}
