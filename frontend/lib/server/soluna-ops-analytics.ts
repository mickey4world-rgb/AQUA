/**
 * Soluna 資産運用・BOINC の運用分析レポート（コストダッシュボード用）
 */
import { isBitFlyerEnabled } from "@/lib/server/soluna-asset-trade";
import {
  getSystemAssets,
  getSystemSettlement,
  listSystemBoincRuns,
} from "@/lib/server/soluna-system-store";
import type {
  SolunaOpsAnalyticsReport,
  SolunaOpsDaySummary,
  SolunaOpsHourBucket,
  SolunaOpsTradeRow,
} from "@/lib/types/analytics";
import type { SolunaTradeRecord } from "@/lib/types/soluna";

function monthLabelJa(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${Number(match[1])}年${Number(match[2])}月`;
}

function inMonth(iso: string, month: string): boolean {
  return iso.slice(0, 7) === month;
}

/** JST の YYYY-MM-DD */
function jstDateKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function jstHour(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

function shiftJstDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d! + deltaDays);
  return new Date(utc).toISOString().slice(0, 10);
}

function dateLabelJa(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${m}月${d}日`;
}

function toTradeRow(t: SolunaTradeRecord): SolunaOpsTradeRow {
  return {
    id: t.id,
    createdAt: t.createdAt,
    side: t.side,
    product: t.product ?? "BTC_JPY",
    sizeJpy: t.sizeJpy,
    priceBtc: t.priceBtc,
    realizedPnlJpy: t.realizedPnlJpy,
    reason: t.reason,
    briefingId: t.briefingId,
  };
}

function summarizeDay(dateKey: string, trades: SolunaTradeRecord[]): SolunaOpsDaySummary {
  const buyTrades = trades.filter((t) => t.side === "BUY");
  const sellTrades = trades.filter((t) => t.side === "SELL");
  const products = [...new Set(trades.map((t) => (t.product ?? "BTC_JPY").replace("_JPY", "")))];
  return {
    date: dateKey,
    label: dateLabelJa(dateKey),
    tradeCount: trades.length,
    buyYen: buyTrades.reduce((s, t) => s + (t.sizeJpy ?? 0), 0),
    sellYen: sellTrades.reduce((s, t) => s + (t.sizeJpy ?? 0), 0),
    realizedPnlYen: sellTrades.reduce((s, t) => s + (t.realizedPnlJpy ?? 0), 0),
    buyCount: buyTrades.length,
    sellCount: sellTrades.length,
    products,
  };
}

function buildHourlyBuckets(
  trades: SolunaTradeRecord[],
  options: { fillAllHours: boolean },
): SolunaOpsHourBucket[] {
  const byHour = new Map<number, SolunaOpsHourBucket>();

  const ensure = (hour: number): SolunaOpsHourBucket => {
    let bucket = byHour.get(hour);
    if (!bucket) {
      bucket = {
        hour,
        label: `${String(hour).padStart(2, "0")}時`,
        tradeCount: 0,
        buyYen: 0,
        sellYen: 0,
        realizedPnlYen: 0,
        actions: [],
      };
      byHour.set(hour, bucket);
    }
    return bucket;
  };

  if (options.fillAllHours) {
    for (let h = 0; h < 24; h++) ensure(h);
  }

  const sorted = [...trades].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const t of sorted) {
    const hour = jstHour(t.createdAt);
    const bucket = ensure(hour);
    bucket.tradeCount += 1;
    if (t.side === "BUY") bucket.buyYen += t.sizeJpy ?? 0;
    if (t.side === "SELL") {
      bucket.sellYen += t.sizeJpy ?? 0;
      bucket.realizedPnlYen += t.realizedPnlJpy ?? 0;
    }
    const time = new Date(t.createdAt).toLocaleTimeString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
    bucket.actions.push({
      time,
      side: t.side,
      product: (t.product ?? "BTC_JPY").replace("_JPY", ""),
      sizeJpy: t.sizeJpy ?? 0,
      reason: t.reason,
    });
  }

  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

export async function buildSolunaOpsAnalyticsReport(
  month: string,
): Promise<SolunaOpsAnalyticsReport> {
  const [assets, settlement, boincRuns] = await Promise.all([
    getSystemAssets(),
    getSystemSettlement(),
    listSystemBoincRuns(90),
  ]);

  const allTrades = assets?.trades ?? [];
  const monthTrades = allTrades.filter((t) => inMonth(t.createdAt, month));
  const monthBuyYen = monthTrades
    .filter((t) => t.side === "BUY")
    .reduce((s, t) => s + (t.sizeJpy ?? 0), 0);
  const monthSellYen = monthTrades
    .filter((t) => t.side === "SELL")
    .reduce((s, t) => s + (t.sizeJpy ?? 0), 0);
  const monthRealizedPnlYen = monthTrades
    .filter((t) => t.side === "SELL")
    .reduce((s, t) => s + (t.realizedPnlJpy ?? 0), 0);

  const todayKey = jstDateKey(new Date());
  const yesterdayKey = shiftJstDateKey(todayKey, -1);
  const todayTrades = allTrades.filter((t) => jstDateKey(t.createdAt) === todayKey);
  const yesterdayTrades = allTrades.filter((t) => jstDateKey(t.createdAt) === yesterdayKey);

  const btcPrice = assets?.btcPriceYen ?? 0;
  const ethPrice = assets?.ethPriceYen ?? 0;
  const zpgPrice = assets?.zpgPriceYen ?? 0;
  const btcHeld = assets?.btcHeld ?? 0;
  const ethHeld = assets?.ethHeld ?? 0;
  const zpgHeld = assets?.zpgHeld ?? 0;
  const btcValueYen = Math.round(btcHeld * btcPrice);
  const ethValueYen = Math.round(ethHeld * ethPrice);
  const zpgValueYen = Math.round(zpgHeld * zpgPrice);
  const totalYen = assets?.totalYen ?? 0;
  const previousTotalYen = assets?.previousTotalYen ?? totalYen;
  const monthlyTarget = Math.max(1, assets?.monthlyTargetYen ?? 1);
  const monthlyPnl = assets?.monthlyRealizedPnlYen ?? 0;

  const monthBoinc = boincRuns.filter((r) => inMonth(r.createdAt, month));
  const sumPlanned = (runs: typeof boincRuns) =>
    runs.reduce((s, r) => s + (r.minutes ?? 0), 0);
  const sumActual = (runs: typeof boincRuns) =>
    runs.reduce((s, r) => s + (r.result?.runMinutesActual ?? 0), 0);
  const sumCredit = (runs: typeof boincRuns) =>
    runs.reduce((s, r) => s + (r.result?.creditGranted ?? 0), 0);
  const sumTasks = (runs: typeof boincRuns) =>
    runs.reduce((s, r) => s + (r.result?.tasksCompleted ?? 0), 0);

  return {
    month,
    monthLabel: monthLabelJa(month),
    bitFlyerConfigured: isBitFlyerEnabled(),
    updatedAt: assets?.updatedAt ?? settlement?.updatedAt ?? null,
    assets: assets
      ? {
          status: assets.status,
          sleepMode: assets.sleepMode,
          battleMode: assets.battleMode ?? "defense",
          principalYen: assets.principalYen ?? 100_000,
          totalYen,
          cashYen: assets.cashYen ?? 0,
          btcHeld,
          ethHeld,
          zpgHeld,
          btcPriceYen: btcPrice,
          ethPriceYen: ethPrice,
          zpgPriceYen: zpgPrice,
          btcValueYen,
          ethValueYen,
          zpgValueYen,
          previousTotalYen,
          dayChangeYen: Math.round(totalYen - previousTotalYen),
          monthlyTargetYen: assets.monthlyTargetYen ?? 0,
          monthlyRealizedPnlYen: monthlyPnl,
          targetProgressPct: Math.min(100, Math.round((monthlyPnl / monthlyTarget) * 100)),
          golemLevel: (assets.cashYen ?? 0) / 10_000,
          dragonLevel: btcValueYen / 10_000,
          monthBuyYen,
          monthSellYen,
          monthTradeCount: monthTrades.length,
          monthRealizedPnlYen,
          yesterday: summarizeDay(yesterdayKey, yesterdayTrades),
          today: summarizeDay(todayKey, todayTrades),
          todayHourly: buildHourlyBuckets(todayTrades, { fillAllHours: true }),
          yesterdayHourly: buildHourlyBuckets(yesterdayTrades, { fillAllHours: false }),
          trades: monthTrades
            .slice()
            .reverse()
            .slice(0, 40)
            .map(toTradeRow),
          monthlySummaries: (assets.monthlySummaries ?? []).slice(-12).map((m) => ({
            month: m.month,
            openingBalanceYen: m.openingBalanceYen,
            targetProfitYen: m.targetProfitYen,
            realizedPnlYen: m.realizedPnlYen,
            goalReached: m.goalReached,
          })),
          solComment: assets.solComment ?? "",
          lunaComment: assets.lunaComment ?? "",
        }
      : null,
    boinc: {
      monthRunCount: monthBoinc.length,
      monthPlannedMinutes: sumPlanned(monthBoinc),
      monthActualMinutes: sumActual(monthBoinc),
      monthCreditGranted: Math.round(sumCredit(monthBoinc) * 100) / 100,
      monthTasksCompleted: sumTasks(monthBoinc),
      lifetimePlannedMinutes: sumPlanned(boincRuns),
      lifetimeActualMinutes: sumActual(boincRuns),
      lifetimeCreditGranted: Math.round(sumCredit(boincRuns) * 100) / 100,
      lifetimeTasksCompleted: sumTasks(boincRuns),
      runs: boincRuns.slice(0, 45).map((r) => ({
        id: r.id,
        briefingId: r.briefingId,
        createdAt: r.createdAt,
        plannedMinutes: r.minutes,
        actualMinutes: r.result?.runMinutesActual ?? null,
        status: r.status,
        creditGranted: r.result?.creditGranted ?? null,
        tasksCompleted: r.result?.tasksCompleted ?? null,
        projectName: r.result?.projectName ?? null,
        projectUrl: r.result?.projectUrl ?? null,
        finishedAt: r.result?.finishedAt ?? null,
      })),
    },
    settlement: settlement
      ? {
          settlementName: settlement.settlementName,
          settlementLevel: settlement.settlementLevel,
          cumulativeMinutes: settlement.cumulativeMinutes,
          analysisSlots: settlement.analysisSlots,
          facilities: (settlement.facilities ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            location: f.location,
            levelLabel: f.levelLabel,
            builtAt: f.builtAt,
          })),
          latestHeadline: settlement.latestEvent?.headline ?? null,
          latestTopic: settlement.latestEvent?.topic ?? null,
        }
      : null,
  };
}
