import {
  authorizeStockBridge,
} from "@/lib/server/stock-broker";
import {
  buildStockBrokerTradeIntents,
  isRoughJpEquitySession,
  wasIntentAlreadyHandled,
} from "@/lib/server/stock-broker-trade";
import { recordSecurityEvent } from "@/lib/server/security-event";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * kabu-bridge が取得する発注インテント（Phase C2: 日本株・現物の買い/売りシミュ）。
 * Bearer STOCK_KABU_BRIDGE_SECRET + ?userId=
 */
export async function GET(request: Request) {
  if (!authorizeStockBridge(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "株インテント取得への不正アクセス",
      reason: "有効な STOCK_KABU_BRIDGE_SECRET なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const all = await buildStockBrokerTradeIntents(userId);
    const intents = [];
    for (const intent of all) {
      if (await wasIntentAlreadyHandled(userId, intent.id)) continue;
      intents.push(intent);
    }

    return Response.json({
      ok: true,
      policy: "C2-jp-cash-buy-sell-sim",
      sessionOpenGuess: isRoughJpEquitySession(),
      intents,
      note: "検証: 現物の買い/売り dry-run。KABU_ALLOW_LIVE_ORDERS なしでは sendorder しない。信用・米国株は未対応。",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "インテント生成に失敗しました",
      },
      { status: 502 },
    );
  }
}
