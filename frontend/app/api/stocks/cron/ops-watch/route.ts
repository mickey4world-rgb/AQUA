/**
 * POST /api/stocks/cron/ops-watch
 * 場中の自動判断結果を見て OTP/同期枯れをメール通知（回復本体は VM）。
 * Authorization: Bearer STOCK_KABU_BRIDGE_SECRET | SOLUNA_CRON_SECRET
 * Body optional: { userId?: string }
 */
import { runStockOpsWatchForUser } from "@/lib/server/stock-ops-watch";
import { parseJsonBody } from "@/lib/server/security";
import { requestHasAutomationSecret } from "@/lib/server/automation-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request): boolean {
  if (requestHasAutomationSecret(request, [process.env.STOCK_KABU_BRIDGE_SECRET])) {
    return true;
  }
  return requestHasAutomationSecret(
    request,
    [process.env.SOLUNA_CRON_SECRET],
    ["x-soluna-cron-secret"],
  );
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId =
    process.env.STOCK_AUTO_TRADE_USER_ID?.trim() ||
    process.env.STOCK_KABU_DEFAULT_USER_ID?.trim() ||
    "";

  try {
    const raw = await request.json().catch(() => ({}));
    const body = parseJsonBody<{ userId?: string }>(raw);
    if (body?.userId?.trim()) userId = body.userId.trim();
  } catch {
    /* empty body ok */
  }

  if (!userId) {
    return Response.json(
      {
        error:
          "userId required (body.userId or STOCK_AUTO_TRADE_USER_ID / vars)",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runStockOpsWatchForUser(userId);
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("[stocks/cron/ops-watch]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "ops-watch failed",
      },
      { status: 502 },
    );
  }
}
