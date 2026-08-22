/**
 * Soluna 資産運用・BOINC の運用分析レポート（コストダッシュボード用）
 */
import { isBitFlyerEnabled } from "@/lib/server/soluna-asset-trade";
import { buildSolunaNoteOpsReport } from "@/lib/server/soluna-note-stats";
import {
  getSystemAssets,
  getSystemSettlement,
  listSystemBoincRuns,
} from "@/lib/server/soluna-system-store";
import type {
  SolunaOpsAnalyticsReport,
  SolunaOpsDaySummary,
  SolunaOpsHourBucket,
  SolunaOpsProductMonthStat,
  SolunaOpsTradeRow,
} from "@/lib/types/analytics";
import type { SolunaTradeProduct, SolunaTradeRecord } from "@/lib/types/soluna";

const PRODUCT_LABELS: Record<string, string> = {
  BTC_JPY: "BTC",
  ETH_JPY: "ETH",
  XRP_JPY: "XRP",
};

async function fetchPublicLtp(product: string): Promise<number> {
  try {
    const res = await fetch(`https://api.bitflyer.com/v1/ticker?product_code=${product}`, {
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { ltp?: number };
    return typeof data.ltp === "number" && data.ltp > 0 ? data.ltp : 0;
  } catch {
    return 0;
  }
}

function productKey(t: SolunaTradeRecord): string {
  return t.product ?? "BTC_JPY";
}

function summarizeProductMonth(
  monthTrades: SolunaTradeRecord[],
  product: SolunaTradeProduct,
  held: number,
  priceYen: number,
  totalYen: number,
): SolunaOpsProductMonthStat {
  const rows = monthTrades.filter((t) => productKey(t) === product);
  const buys = rows.filter((t) => t.side === "BUY");
  const sells = rows.filter((t) => t.side === "SELL");
  const valueYen = Math.round(held * priceYen);
  return {
    product,
    label: PRODUCT_LABELS[product] ?? product.replace("_JPY", ""),
    buyYen: buys.reduce((s, t) => s + (t.sizeJpy ?? 0), 0),
    sellYen: sells.reduce((s, t) => s + (t.sizeJpy ?? 0), 0),
    buyCount: buys.length,
    sellCount: sells.length,
    realizedPnlYen: sells.reduce((s, t) => s + (t.realizedPnlJpy ?? 0), 0),
    held,
    valueYen,
    priceYen,
    allocationPct: totalYen > 0 ? Math.round((valueYen / totalYen) * 1000) / 10 : 0,
  };
}

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
  const [assets, settlement, boincRuns, note] = await Promise.all([
    getSystemAssets(),
    getSystemSettlement(),
    listSystemBoincRuns(90),
    buildSolunaNoteOpsReport(month),
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

  // 台帳に XRP 価格がまだ無い場合でも公開板で補完し、配分を正しく出す
  const [liveBtc, liveEth, liveXrp] = await Promise.all([
    fetchPublicLtp("BTC_JPY"),
    fetchPublicLtp("ETH_JPY"),
    fetchPublicLtp("XRP_JPY"),
  ]);
  const btcPrice = (assets?.btcPriceYen && assets.btcPriceYen > 0 ? assets.btcPriceYen : liveBtc) || 0;
  const ethPrice = (assets?.ethPriceYen && assets.ethPriceYen > 0 ? assets.ethPriceYen : liveEth) || 0;
  const xrpPrice = (assets?.xrpPriceYen && assets.xrpPriceYen > 0 ? assets.xrpPriceYen : liveXrp) || 0;
  const btcHeld = assets?.btcHeld ?? 0;
  const ethHeld = assets?.ethHeld ?? 0;
  const xrpHeld = assets?.xrpHeld ?? 0;
  const cashYen = assets?.cashYen ?? 0;
  const btcValueYen = Math.round(btcHeld * btcPrice);
  const ethValueYen = Math.round(ethHeld * ethPrice);
  const xrpValueYen = Math.round(xrpHeld * xrpPrice);
  const markedTotalYen = Math.round(cashYen + btcValueYen + ethValueYen + xrpValueYen);
  const totalYen = markedTotalYen > 0 ? markedTotalYen : (assets?.totalYen ?? 0);
  const previousTotalYen = assets?.previousTotalYen ?? totalYen;
  const monthlyTarget = Math.max(1, assets?.monthlyTargetYen ?? 1);
  const monthlyPnl = assets?.monthlyRealizedPnlYen ?? 0;
  const pct = (part: number) => (totalYen > 0 ? Math.round((part / totalYen) * 1000) / 10 : 0);

  const byProduct: SolunaOpsProductMonthStat[] = [
    summarizeProductMonth(monthTrades, "BTC_JPY", btcHeld, btcPrice, totalYen),
    summarizeProductMonth(monthTrades, "ETH_JPY", ethHeld, ethPrice, totalYen),
    summarizeProductMonth(monthTrades, "XRP_JPY", xrpHeld, xrpPrice, totalYen),
  ];

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
    updatedAt: assets?.updatedAt ?? settlement?.updatedAt ?? note.latestPublishedAt,
    assets: assets
      ? {
          status: assets.status,
          sleepMode: assets.sleepMode,
          battleMode: assets.battleMode ?? "defense",
          principalYen: assets.principalYen ?? 100_000,
          totalYen,
          cashYen,
          btcHeld,
          ethHeld,
          xrpHeld,
          btcPriceYen: btcPrice,
          ethPriceYen: ethPrice,
          xrpPriceYen: xrpPrice,
          btcValueYen,
          ethValueYen,
          xrpValueYen,
          cashAllocationPct: pct(cashYen),
          btcAllocationPct: pct(btcValueYen),
          ethAllocationPct: pct(ethValueYen),
          xrpAllocationPct: pct(xrpValueYen),
          previousTotalYen,
          dayChangeYen: Math.round(totalYen - previousTotalYen),
          monthlyTargetYen: assets.monthlyTargetYen ?? 0,
          monthlyRealizedPnlYen: monthlyPnl,
          targetProgressPct: Math.min(100, Math.round((monthlyPnl / monthlyTarget) * 100)),
          golemLevel: cashYen / 10_000,
          dragonLevel: btcValueYen / 10_000,
          phoenixLevel: ethValueYen / 10_000,
          seaDragonLevel: xrpValueYen / 10_000,
          monthBuyYen,
          monthSellYen,
          monthTradeCount: monthTrades.length,
          monthRealizedPnlYen,
          byProduct,
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
    note,
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
