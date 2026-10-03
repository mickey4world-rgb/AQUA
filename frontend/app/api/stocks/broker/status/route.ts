import { withApiAccessLog } from "@/lib/server/api-access";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listRecentBrokerOrders } from "@/lib/server/stock-broker-trade";
import { listStockWatches } from "@/lib/server/stock-watches";
import {
  getStockTradeLessonBias,
  getStockTradingHalt,
  listStockTradeLessons,
} from "@/lib/server/stock-trade-lessons";
import { getLatestWeeklyUniverseReview } from "@/lib/server/stock-weekly-universe-review";
import { buildStockBrokerActivity } from "@/lib/stock-broker-activity";
import { buildStockEquityPerformance } from "@/lib/stock-equity-performance";
import { evaluateStockGuardrails } from "@/lib/stock-guardrails";
import { buildStockVmRuntimeStatus } from "@/lib/stock-vm-status";
import {
  STOCK_JP_UNIVERSE,
  stockJpUniverseByCode,
} from "@/lib/stock-jp-universe";
import { displayTicker } from "@/lib/stock-utils";
import {
  STOCK_CUMULATIVE_MAX_LOSS_YEN,
  STOCK_MONTHLY_MAX_LOSS_YEN,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_RATE,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PER_TRADE_MAX_LOSS_YEN,
  STOCK_PRINCIPAL_YEN,
  STOCK_SMALL_INVEST_CASH_FLOOR_YEN,
} from "@/lib/stock-trade-constants";
import { stockTradeRulesForApi } from "@/lib/stock-trade-rules";

/** ログインユーザーの証券同期＋注文＋条件＋監査＋元本対比グラフ */
export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    const [snapshot, recentOrders, lessons, bias, watches, halt, weeklyReview] =
      await Promise.all([
        getStockBrokerSnapshot(auth.userId),
        listRecentBrokerOrders(auth.userId, 200).catch(() => []),
        listStockTradeLessons(auth.userId, 8).catch(() => []),
        getStockTradeLessonBias(auth.userId).catch(() => null),
        listStockWatches(auth.userId).catch(() => []),
        getStockTradingHalt(auth.userId).catch(
          (): { halted: boolean; haltedAt?: string; reason?: string } => ({
            halted: false,
          }),
        ),
        getLatestWeeklyUniverseReview(auth.userId).catch(() => null),
      ]);

    const ordersForChart = recentOrders.map((o) => {
      if (o.side !== "sell" || o.realizedPnlYen != null) return o;
      const watch = watches.find(
        (w) =>
          (w.market ?? "us") === "jp" &&
          displayTicker(w.ticker, "jp") === o.symbol,
      );
      const px =
        snapshot?.holdings.find((h) => h.symbol === o.symbol)?.price ?? 0;
      const cost = watch?.buyPrice ?? 0;
      if (cost > 0 && px > 0) {
        return { ...o, realizedPnlYen: (px - cost) * o.qty };
      }
      return o;
    });

    const equityPerformance = buildStockEquityPerformance({
      orders: ordersForChart,
      principalYen: STOCK_PRINCIPAL_YEN,
      monthlyTargetYen: STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
    });

    const tradeRules = [
      ...stockTradeRulesForApi(),
      ...(bias?.promotedRules ?? []).map((r, i) => ({
        id: 100 + i,
        category: "mode" as const,
        categoryLabel: "監査昇格",
        title: r.title,
        summary: r.summary,
      })),
    ];

    const cash = snapshot?.cash.stockAccountWallet ?? 0;
    const guardrails = evaluateStockGuardrails({
      orders: ordersForChart,
      tradingHalted: halt.halted,
    });

    const holdingQty = new Map<string, number>();
    for (const h of snapshot?.holdings ?? []) {
      holdingQty.set(
        h.symbol,
        (holdingQty.get(h.symbol) ?? 0) + (h.qty ?? 0),
      );
    }

    const jpWatches = watches.filter((w) => (w.market ?? "us") === "jp");
    const watchByCode = new Map(
      jpWatches.map((w) => [displayTicker(w.ticker, "jp"), w] as const),
    );
    const scoreByCode = new Map(
      (weeklyReview?.scores ?? []).map((s) => [s.code, s] as const),
    );

    const candidateCodes = new Set<string>([
      ...STOCK_JP_UNIVERSE.map((e) => e.code),
      ...watchByCode.keys(),
    ]);

    const tradeCandidates = [...candidateCodes]
      .map((code) => {
        const watch = watchByCode.get(code);
        const uni = stockJpUniverseByCode(code);
        const score = scoreByCode.get(code);
        return {
          code,
          watchId: watch?.id ?? null,
          name: watch?.name || uni?.name || code,
          isActive: watch?.isActive === true,
          registered: Boolean(watch),
          shares: watch?.shares ?? 0,
          heldQty: holdingQty.get(code) ?? 0,
          buyPrice: watch?.buyPrice ?? score?.price ?? 0,
          targetPrice: watch?.targetPrice ?? 0,
          memo: watch?.memo,
          tier: uni?.tier ?? null,
          tags: uni ? [...uni.tags] : [],
          newsFitBonus: score?.newsFitBonus ?? 0,
          weeklyScore: score?.score ?? null,
          lotYen: score?.lotYen ?? null,
          affordable: score?.affordable ?? null,
        };
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.registered !== b.registered) return a.registered ? -1 : 1;
        return (b.weeklyScore ?? -999) - (a.weeklyScore ?? -999);
      });

    const meta = snapshot?.bridgeMeta;
    const allowLiveOrders =
      typeof meta?.allowLiveOrders === "boolean"
        ? meta.allowLiveOrders
        : recentOrders.some((o) => o.status === "submitted");
    const kabuPort = meta?.kabuPort ?? null;
    const productionApi = kabuPort === 18080;

    const activeWatchCount = jpWatches.filter((w) => w.isActive).length;
    const activity = buildStockBrokerActivity({
      orders: recentOrders,
      snapshot,
      activeWatchCount,
      allowLiveOrders,
    });

    const vmStatus = buildStockVmRuntimeStatus({
      snapshot,
      orders: recentOrders,
    });

    const payload = {
      connected: Boolean(snapshot),
      snapshot,
      recentOrders: recentOrders.slice(0, 15),
      tradeRules,
      tradeLessons: lessons,
      lessonNotes: bias?.notes ?? [],
      equityPerformance,
      tradeCandidates,
      activity,
      vmStatus,
      liveMode: {
        allowLiveOrders,
        kabuPort,
        productionApi,
        source: meta ? "bridge-sync" : "inferred",
      },
      guardrails: {
        ...guardrails,
        tradingHalted: halt.halted,
        tradingHaltedAt: halt.haltedAt,
        tradingHaltReason: halt.reason,
        layers: {
          perTradeMaxLossYen: STOCK_PER_TRADE_MAX_LOSS_YEN,
          monthlyMaxLossYen: STOCK_MONTHLY_MAX_LOSS_YEN,
          cumulativeMaxLossYen: STOCK_CUMULATIVE_MAX_LOSS_YEN,
        },
      },
      goals: {
        principalYen: STOCK_PRINCIPAL_YEN,
        monthlySellProfitTargetYen: STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
        monthlySellProfitTargetRate: STOCK_MONTHLY_SELL_PROFIT_TARGET_RATE,
        smallInvestCashFloorYen: STOCK_SMALL_INVEST_CASH_FLOOR_YEN,
        smallInvestMode: cash < STOCK_SMALL_INVEST_CASH_FLOOR_YEN,
      },
      policy: "C2-jp-cash-buy-sell-sim",
      weeklyUniverseReview: weeklyReview
        ? {
            weekId: weeklyReview.weekId,
            applied: weeklyReview.applied,
            dryRun: weeklyReview.dryRun,
            summary: weeklyReview.summary,
            desiredActiveCodes: weeklyReview.desiredActiveCodes,
            appliedActions: weeklyReview.appliedActions ?? [],
            newsDigestId: weeklyReview.newsDigestId ?? null,
            createdAt: weeklyReview.createdAt,
          }
        : null,
      hint: snapshot
        ? undefined
        : "Azure VM 上で kabu-bridge: npm run sync → npm run trade。手順は docs/STOCK_KABU_AZURE_VM.md",
    };
    return Response.json(payload);
  });
}
