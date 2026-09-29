import { authorizeStockBridge } from "@/lib/server/stock-broker";
import { recordBrokerOrder } from "@/lib/server/stock-broker-trade";
import { parseJsonBody } from "@/lib/server/security";
import { recordSecurityEvent } from "@/lib/server/security-event";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

export const dynamic = "force-dynamic";

type OrderReportBody = {
  userId?: string;
  intentId?: string;
  side?: "sell" | "buy";
  symbol?: string;
  exchange?: number;
  qty?: number;
  status?: StockBrokerOrderRecord["status"];
  dryRun?: boolean;
  reason?: string;
  ruleIds?: number[];
  kabuOrderId?: string;
  kabuResultCode?: number | string;
  message?: string;
  id?: string;
};

/** bridge からの約定／dry-run 報告 */
export async function POST(request: Request) {
  if (!authorizeStockBridge(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "株注文報告への不正アクセス",
      reason: "有効な STOCK_KABU_BRIDGE_SECRET なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = parseJsonBody<OrderReportBody>(raw);
  if (
    !body?.userId ||
    !body.intentId ||
    !body.side ||
    !body.symbol ||
    typeof body.qty !== "number" ||
    !body.status
  ) {
    return Response.json(
      { error: "userId, intentId, side, symbol, qty, status required" },
      { status: 400 },
    );
  }

  try {
    const saved = await recordBrokerOrder({
      id: typeof body.id === "string" ? body.id : undefined,
      userId: body.userId,
      intentId: body.intentId,
      side: body.side,
      symbol: body.symbol,
      exchange: Number(body.exchange) || 1,
      qty: body.qty,
      status: body.status,
      dryRun: Boolean(body.dryRun),
      reason: typeof body.reason === "string" ? body.reason : "",
      ruleIds: Array.isArray(body.ruleIds)
        ? body.ruleIds.filter((n): n is number => typeof n === "number")
        : undefined,
      kabuOrderId:
        typeof body.kabuOrderId === "string" ? body.kabuOrderId : undefined,
      kabuResultCode: body.kabuResultCode,
      message: typeof body.message === "string" ? body.message : undefined,
    });
    return Response.json({ ok: true, id: saved.id, status: saved.status });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "注文報告の保存に失敗しました",
      },
      { status: 502 },
    );
  }
}
