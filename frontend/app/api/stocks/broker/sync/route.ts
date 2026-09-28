import {
  authorizeStockBridge,
  upsertStockBrokerSnapshot,
} from "@/lib/server/stock-broker";
import { parseJsonBody } from "@/lib/server/security";
import { recordSecurityEvent } from "@/lib/server/security-event";
import type { StockBrokerSyncPayload } from "@/lib/types/stock-broker";

export const dynamic = "force-dynamic";

/**
 * ローカル kabu-bridge からの保有・余力同期（発注は受けない）。
 * SWA は anonymous 許可 + Bearer STOCK_KABU_BRIDGE_SECRET。
 */
export async function POST(request: Request) {
  if (!authorizeStockBridge(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "株ブローカー同期への不正アクセス",
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

  const body = parseJsonBody<StockBrokerSyncPayload & Record<string, unknown>>(
    raw,
  );
  if (!body || typeof body.userId !== "string" || !body.cash) {
    return Response.json(
      { error: "userId and cash are required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.holdings)) {
    return Response.json({ error: "holdings must be an array" }, { status: 400 });
  }

  // 発注フィールドが混入していても無視（Phase1 不変条件）
  try {
    const saved = await upsertStockBrokerSnapshot({
      userId: body.userId,
      broker: "kabu",
      syncedAt:
        typeof body.syncedAt === "string" ? body.syncedAt : undefined,
      cash: body.cash,
      holdings: body.holdings,
      rawPositionCount:
        typeof body.rawPositionCount === "number"
          ? body.rawPositionCount
          : undefined,
    });
    return Response.json({
      ok: true,
      id: saved.id,
      syncedAt: saved.syncedAt,
      holdings: saved.holdings.length,
      stockAccountWallet: saved.cash.stockAccountWallet,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "ブローカー同期に失敗しました",
      },
      { status: 502 },
    );
  }
}
