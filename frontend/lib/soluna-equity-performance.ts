/**
 * 資産運用の実現損益推移（折れ線）を台帳・取引から組み立てる（クライアント可）
 *
 * 不変条件（ユーザー依頼）:
 * - 線は「元本 + 累積実現損益」。保有銘柄の時価（含み）は載せない。
 * - 買いは線を動かさない（マーカーのみ）。売りで realizedPnlJpy 分だけ上下する。
 * - 月次サマリーで、台帳 trades が短い場合の月跨ぎを補完する。
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
  /**
   * 実現ベース評価額 = 元本 + その日までの累積実現損益。
   * （フィールド名は互換のため totalYen のまま）
   */
  totalYen: number;
  cashYen: number;
  pnlYen: number;
  monthGoalTotalYen: number;
  buyYen: number;
  sellYen: number;
  tradeCount: number;
  /** seed | month-open | month-realized | trade-realized | live */
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
  /** マーカーの Y = その約定直後の実現ベース評価 */
  totalYen: number;
}

export interface SolunaEquityPerformance {
  principalYen: number;
  startDate: string;
  /** 実現ベース評価（元本 + 累積実現） */
  currentTotalYen: number;
  currentCashYen: number;
  /** 累積実現損益 */
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
  const dow = utc.getUTCDay();
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

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m!, 0)); // day 0 of next month
  return utc.toISOString().slice(0, 10);
}

export function cumulativeRealizedPnlYen(trades: SolunaTradeRecord[]): number {
  return trades
    .filter((t) => t.side === "SELL")
    .reduce((s, t) => s + (t.realizedPnlJpy ?? 0), 0);
}

/**
 * 約定を反映して同日スナップショットを更新／追加する。
 * totalYen / pnlYen は実現ベース（時価総資産ではない）。
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

  // 台帳 trades は呼び出し時点で今回約定を含む想定
  const realizedPnl = Math.round(cumulativeRealizedPnlYen(ledger.trades ?? []));
  const realizedEquity = Math.round(principal + realizedPnl);

  const prev = [...(ledger.equitySnapshots ?? [])];
  const last = prev[prev.length - 1];
  const sameDay = last?.date === date;

  const point: SolunaEquitySnapshot = {
    date,
    at,
    totalYen: realizedEquity,
    cashYen: Math.round(ledger.cashYen),
    pnlYen: realizedPnl,
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
  // 優先度: live/trade-realized > month-realized > month-open > seed
  // snapshot（旧時価）は使わない — 呼び出し側で渡さない
  const rank = (s: string) =>
    s === "live" || s === "trade-realized"
      ? 4
      : s === "month-realized"
        ? 3
        : s === "month-open"
          ? 2
          : 1;
  if (rank(partial.source) >= rank(existing.source)) {
    const addTrade = partial.source === "trade-realized";
    map.set(partial.date, {
      ...next,
      buyYen: addTrade ? existing.buyYen + next.buyYen : Math.max(existing.buyYen, next.buyYen),
      sellYen: addTrade
        ? existing.sellYen + next.sellYen
        : Math.max(existing.sellYen, next.sellYen),
      tradeCount: addTrade
        ? existing.tradeCount + next.tradeCount
        : Math.max(existing.tradeCount, next.tradeCount),
    });
  } else {
    const addTrade = partial.source === "trade-realized";
    map.set(partial.date, {
      ...existing,
      buyYen: addTrade ? existing.buyYen + next.buyYen : existing.buyYen,
      sellYen: addTrade ? existing.sellYen + next.sellYen : existing.sellYen,
      tradeCount: addTrade ? existing.tradeCount + next.tradeCount : existing.tradeCount,
    });
  }
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

/**
 * 売り約定の実現損益だけで曲線を進める（買いは水平）。
 */
function walkRealizedFromTrades(
  principal: number,
  startingCumPnl: number,
  trades: SolunaTradeRecord[],
  monthGoalForDate: (date: string) => number,
): { points: MutablePoint[]; markers: SolunaEquityTradeMarker[]; cumPnl: number } {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let cumPnl = startingCumPnl;
  const byDate = new Map<string, MutablePoint>();
  const markers: SolunaEquityTradeMarker[] = [];

  for (const t of sorted) {
    const date = jstDateKey(t.createdAt);
    if (t.side === "SELL") {
      cumPnl += t.realizedPnlJpy ?? 0;
    }
    const equity = Math.round(principal + cumPnl);
    const prev = byDate.get(date);
    byDate.set(date, {
      date,
      label: dateLabelJa(date),
      totalYen: equity,
      cashYen: equity,
      pnlYen: Math.round(cumPnl),
      monthGoalTotalYen: monthGoalForDate(date),
      buyYen: (prev?.buyYen ?? 0) + (t.side === "BUY" ? t.sizeJpy ?? 0 : 0),
      sellYen: (prev?.sellYen ?? 0) + (t.side === "SELL" ? t.sizeJpy ?? 0 : 0),
      tradeCount: (prev?.tradeCount ?? 0) + 1,
      source: "trade-realized",
    });
    markers.push({
      id: t.id,
      date,
      at: t.createdAt,
      side: t.side,
      product: (t.product ?? "BTC_JPY").replace("_JPY", ""),
      sizeJpy: t.sizeJpy ?? 0,
      realizedPnlJpy: t.realizedPnlJpy,
      totalYen: equity,
    });
  }

  return { points: [...byDate.values()], markers, cumPnl };
}

export function buildEquityPerformance(input: {
  principalYen?: number;
  /** 互換のため残す。折れ線の Y には使わない（時価混入禁止） */
  totalYen: number;
  cashYen: number;
  monthlyTargetYen: number;
  lastMonthTotalYen?: number;
  monthlyRealizedPnlYen?: number;
  monthlySummaries?: SolunaMonthlyAssetSummary[];
  /** 旧時価スナップショットは無視する（意味が変わるため） */
  equitySnapshots?: SolunaEquitySnapshot[];
  trades?: SolunaTradeRecord[];
  now?: Date;
}): SolunaEquityPerformance {
  const principal = input.principalYen || ASSET_PRINCIPAL_YEN;
  const summaries = [...(input.monthlySummaries ?? [])].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  const startMonth =
    summaries[0]?.month && summaries[0].month < ASSET_START_MONTH
      ? summaries[0].month
      : ASSET_START_MONTH;
  const startDate = `${startMonth}-01`;
  const today = jstDateKey(input.now ?? new Date());
  const currentMonth = today.slice(0, 7);

  // 実現ベースの月初評価 → 目標ライン
  const realizedOpenByMonth = new Map<string, number>();
  let walkOpen = principal;
  for (const m of summaries) {
    realizedOpenByMonth.set(m.month, walkOpen);
    walkOpen += m.realizedPnlYen ?? 0;
  }
  if (!realizedOpenByMonth.has(currentMonth)) {
    realizedOpenByMonth.set(
      currentMonth,
      // 先月末までの累積実現 + 元本（サマリーが無い月）
      principal +
        summaries
          .filter((m) => m.month < currentMonth)
          .reduce((s, m) => s + (m.realizedPnlYen ?? 0), 0),
    );
  }

  const goalByMonth = new Map<string, number>();
  for (const m of summaries) {
    const open = realizedOpenByMonth.get(m.month) ?? principal;
    goalByMonth.set(m.month, Math.round(open + (m.targetProfitYen || 0)));
  }
  const currentOpen = realizedOpenByMonth.get(currentMonth) ?? principal;
  const monthGoalTotalYen = Math.round(currentOpen + (input.monthlyTargetYen || 0));
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

  // 確定月（今月より前）: 月次サマリーの実現損益だけでアンカー（台帳 trades 短縮に耐える）
  let cumClosed = 0;
  const closedSummaries = summaries.filter((m) => m.month < currentMonth);
  const useSummaryAnchors = closedSummaries.length > 0;

  if (useSummaryAnchors) {
    for (const m of closedSummaries) {
      const monthStart = `${m.month}-01`;
      upsertPoint(map, {
        date: monthStart,
        totalYen: Math.round(principal + cumClosed),
        cashYen: Math.round(principal + cumClosed),
        pnlYen: Math.round(cumClosed),
        monthGoalTotalYen: monthGoalForDate(monthStart),
        buyYen: 0,
        sellYen: 0,
        tradeCount: 0,
        source: "month-open",
      });
      cumClosed += m.realizedPnlYen ?? 0;
      const end = lastDayOfMonth(m.month);
      upsertPoint(map, {
        date: end,
        totalYen: Math.round(principal + cumClosed),
        cashYen: Math.round(principal + cumClosed),
        pnlYen: Math.round(cumClosed),
        monthGoalTotalYen: monthGoalForDate(end),
        buyYen: 0,
        sellYen: 0,
        tradeCount: 0,
        source: "month-realized",
      });
    }
  }

  // 今月初（確定月の終値＝今月の起点）
  const currentMonthStart = `${currentMonth}-01`;
  if (currentMonthStart <= today) {
    upsertPoint(map, {
      date: currentMonthStart,
      totalYen: Math.round(principal + cumClosed),
      cashYen: Math.round(principal + cumClosed),
      pnlYen: Math.round(cumClosed),
      monthGoalTotalYen: monthGoalForDate(currentMonthStart),
      buyYen: 0,
      sellYen: 0,
      tradeCount: 0,
      source: "month-open",
    });
  }

  // サマリーが無い過去は全約定、あれば今月の約定だけで日次を進める
  const tradesForWalk = useSummaryAnchors
    ? (input.trades ?? []).filter((t) => jstDateKey(t.createdAt).slice(0, 7) === currentMonth)
    : (input.trades ?? []);
  const walked = walkRealizedFromTrades(
    principal,
    cumClosed,
    tradesForWalk,
    monthGoalForDate,
  );
  for (const p of walked.points) {
    upsertPoint(map, p);
  }

  // マーカーは全期間（表示用）。Y は「その月の起点 + 月内の累積実現」
  const allMarkers: SolunaEquityTradeMarker[] = [];
  let markerMonth = "";
  let markerMonthBase = principal;
  let markerCumInMonth = 0;
  const sortedAll = [...(input.trades ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const t of sortedAll) {
    const date = jstDateKey(t.createdAt);
    const month = date.slice(0, 7);
    if (month !== markerMonth) {
      markerMonth = month;
      markerCumInMonth = 0;
      markerMonthBase =
        realizedOpenByMonth.get(month) ??
        principal +
          summaries
            .filter((m) => m.month < month)
            .reduce((s, m) => s + (m.realizedPnlYen ?? 0), 0);
    }
    if (t.side === "SELL") markerCumInMonth += t.realizedPnlJpy ?? 0;
    const equity = Math.round(markerMonthBase + markerCumInMonth);
    allMarkers.push({
      id: t.id,
      date,
      at: t.createdAt,
      side: t.side,
      product: (t.product ?? "BTC_JPY").replace("_JPY", ""),
      sizeJpy: t.sizeJpy ?? 0,
      realizedPnlJpy: t.realizedPnlJpy,
      totalYen: equity,
    });
  }

  // 現在値: 確定月累積 + 今月の約定実現（無ければ monthlyRealizedPnlYen）
  let finalCum = walked.cumPnl;
  if (
    useSummaryAnchors &&
    tradesForWalk.length === 0 &&
    typeof input.monthlyRealizedPnlYen === "number"
  ) {
    finalCum = cumClosed + input.monthlyRealizedPnlYen;
  }

  const realizedEquity = Math.round(principal + finalCum);
  upsertPoint(map, {
    date: today,
    totalYen: realizedEquity,
    cashYen: Math.round(input.cashYen),
    pnlYen: Math.round(finalCum),
    monthGoalTotalYen,
    buyYen: 0,
    sellYen: 0,
    tradeCount: 0,
    source: "live",
  });

  const points = [...map.values()]
    .filter((p) => p.date >= startDate && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const pnlYen = Math.round(finalCum);
  return {
    principalYen: principal,
    startDate,
    currentTotalYen: realizedEquity,
    currentCashYen: Math.round(input.cashYen),
    pnlYen,
    pnlPct: principal > 0 ? Math.round((pnlYen / principal) * 1000) / 10 : 0,
    monthlyTargetYen: Math.round(input.monthlyTargetYen || 0),
    monthGoalTotalYen,
    monthlyRealizedPnlYen: Math.round(input.monthlyRealizedPnlYen ?? 0),
    points,
    weeklyPoints: rollupWeekly(points),
    markers: allMarkers.length > 0 ? allMarkers : walked.markers,
  };
}
