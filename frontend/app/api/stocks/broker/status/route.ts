import { withApiAccessLog } from "@/lib/server/api-access";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listRecentBrokerOrders } from "@/lib/server/stock-broker-trade";

/** ログインユーザーの証券同期スナップショット（Phase1）＋直近注文（Phase C） */
export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    const [snapshot, recentOrders] = await Promise.all([
      getStockBrokerSnapshot(auth.userId),
      listRecentBrokerOrders(auth.userId, 15).catch(() => []),
    ]);
    if (!snapshot) {
      return Response.json({
        connected: false,
        snapshot: null,
        recentOrders,
        policy: "C1-jp-cash-sell-only",
        hint: "ローカル kabu-bridge で npm run sync すると反映されます。自動発注は npm run trade（既定 dry-run）。手順は docs/STOCK_KABU_SETUP.md",
      });
    }
    return Response.json({
      connected: true,
      snapshot,
      recentOrders,
      policy: "C1-jp-cash-sell-only",
    });
  });
}
