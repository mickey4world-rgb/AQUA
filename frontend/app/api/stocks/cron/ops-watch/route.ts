/**
 * POST /api/stocks/cron/ops-watch
 * 場中の自動判断結果を見て OTP/同期枯れをメール通知（回復本体は VM）。
 * Authorization: Bearer STOCK_KABU_BRIDGE_SECRET | SOLUNA_CRON_SECRET
 * Body optional: { userId?: string }
 */
import { runStockOpsWatchForUser } from "@/lib/server/stock-ops-watch";
import { parseJsonBody } from "@/lib/server/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request): boolean {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const bridge = process.env.STOCK_KABU_BRIDGE_SECRET?.trim();
  const cron = process.env.SOLUNA_CRON_SECRET?.trim();
  if (bridge && bearer === bridge) return true;
  if (cron && bearer === cron) return true;
  const alt = request.headers.get("x-soluna-cron-secret")?.trim();
  if (cron && alt === cron) return true;
  return false;
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
