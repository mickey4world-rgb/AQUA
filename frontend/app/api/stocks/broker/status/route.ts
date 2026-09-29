import { withApiAccessLog } from "@/lib/server/api-access";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listRecentBrokerOrders } from "@/lib/server/stock-broker-trade";
import { stockTradeRulesForApi } from "@/lib/stock-trade-rules";

/** ログインユーザーの証券同期スナップショット＋直近注文＋条件カタログ */
export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    const [snapshot, recentOrders] = await Promise.all([
      getStockBrokerSnapshot(auth.userId),
      listRecentBrokerOrders(auth.userId, 15).catch(() => []),
    ]);
    const tradeRules = stockTradeRulesForApi();
    if (!snapshot) {
      return Response.json({
        connected: false,
        snapshot: null,
        recentOrders,
        tradeRules,
        policy: "C2-jp-cash-buy-sell-sim",
        hint: "Azure VM 上で kabu-bridge: npm run sync → npm run trade（既定 dry-run）。手順は docs/STOCK_KABU_AZURE_VM.md",
      });
    }
    return Response.json({
      connected: true,
      snapshot,
      recentOrders,
      tradeRules,
      policy: "C2-jp-cash-buy-sell-sim",
    });
  });
}
