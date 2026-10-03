import {
  authorizeStockBridge,
  upsertStockBrokerHealth,
} from "@/lib/server/stock-broker";
import { parseJsonBody } from "@/lib/server/security";
import { recordSecurityEvent } from "@/lib/server/security-event";

export const dynamic = "force-dynamic";

/**
 * kabu-bridge からのヘルス報告（トークン失敗時も送る）。
 * 発注なし。外出先確認用。
 */
export async function POST(request: Request) {
  if (!authorizeStockBridge(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "株ブローカーヘルスへの不正アクセス",
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

  const body = parseJsonBody<{
    userId?: string;
    stationReachable?: boolean;
    stationTokenOk?: boolean;
    lastError?: string | null;
    allowLiveOrders?: boolean;
    kabuBaseUrl?: string;
    kabuPort?: number;
    reportedAt?: string;
  }>(raw);

  if (!body || typeof body.userId !== "string" || !body.userId.trim()) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const saved = await upsertStockBrokerHealth({
      userId: body.userId,
      stationReachable: Boolean(body.stationReachable),
      stationTokenOk: Boolean(body.stationTokenOk),
      lastError:
        typeof body.lastError === "string" ? body.lastError : body.lastError,
      allowLiveOrders:
        typeof body.allowLiveOrders === "boolean"
          ? body.allowLiveOrders
          : undefined,
      kabuBaseUrl:
        typeof body.kabuBaseUrl === "string" ? body.kabuBaseUrl : undefined,
      kabuPort: typeof body.kabuPort === "number" ? body.kabuPort : undefined,
      reportedAt:
        typeof body.reportedAt === "string" ? body.reportedAt : undefined,
    });
    return Response.json({
      ok: true,
      id: saved.id,
      stationTokenOk: saved.bridgeMeta?.stationTokenOk === true,
      healthReportedAt: saved.bridgeMeta?.healthReportedAt ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "ヘルス更新に失敗しました",
      },
      { status: 502 },
    );
  }
}
