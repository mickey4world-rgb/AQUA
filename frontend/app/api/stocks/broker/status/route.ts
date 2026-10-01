import { withApiAccessLog } from "@/lib/server/api-access";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listRecentBrokerOrders } from "@/lib/server/stock-broker-trade";
import { listStockWatches } from "@/lib/server/stock-watches";
import {
  getStockTradeLessonBias,
  getStockTradingHalt,
  listStockTradeLessons,
} from "@/lib/server/stock-trade-lessons";
import { buildStockEquityPerformance } from "@/lib/stock-equity-performance";
import { evaluateStockGuardrails } from "@/lib/stock-guardrails";
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
    const [snapshot, recentOrders, lessons, bias, watches, halt] =
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
      ]);

    // 売り注文に実現損益が無い場合、ウォッチ取得単価から概算を付与（グラフ用・非破壊）
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
    const payload = {
      connected: Boolean(snapshot),
      snapshot,
      recentOrders: recentOrders.slice(0, 15),
      tradeRules,
      tradeLessons: lessons,
      lessonNotes: bias?.notes ?? [],
      equityPerformance,
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
      hint: snapshot
        ? undefined
        : "Azure VM 上で kabu-bridge: npm run sync → npm run trade（既定 dry-run）。手順は docs/STOCK_KABU_AZURE_VM.md",
    };
    return Response.json(payload);
  });
}
