import { isCosmosConfigured } from "@/lib/server/cosmos";
import { authorizeStockBridge } from "@/lib/server/stock-broker";
import { requestHasAutomationSecret } from "@/lib/server/automation-auth";
import { recordSecurityEvent } from "@/lib/server/security-event";
import { runDailyHarvestSlate } from "@/lib/server/stock-daily-harvest-slate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 少額売買専用枠（約10件）を前日までの相場で毎日入れ替え。
 * Bearer: STOCK_KABU_BRIDGE_SECRET または SOLUNA_CRON_SECRET
 */
function authorizeCron(request: Request): boolean {
  if (authorizeStockBridge(request)) return true;
  return requestHasAutomationSecret(request, [process.env.SOLUNA_CRON_SECRET]);
}

function resolveUserId(request: Request, bodyUserId?: string): string | null {
  const fromEnv = process.env.STOCK_AUTO_TRADE_USER_ID?.trim();
  const fromQuery = new URL(request.url).searchParams.get("userId")?.trim();
  const fromBody = bodyUserId?.trim();
  return fromBody || fromQuery || fromEnv || null;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "株少額売買枠の日次更新への不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCosmosConfigured()) {
    return Response.json({ error: "Cosmos DB が未設定です。" }, { status: 503 });
  }

  let dryRun = false;
  let force = false;
  let bodyUserId: string | undefined;
  try {
    const body = (await request.json()) as {
      dryRun?: boolean;
      force?: boolean;
      userId?: string;
    };
    dryRun = body.dryRun === true;
    force = body.force === true;
    bodyUserId = body.userId;
  } catch {
    // body なし可
  }

  const userId = resolveUserId(request, bodyUserId);
  if (!userId) {
    return Response.json(
      { error: "userId または STOCK_AUTO_TRADE_USER_ID が必要です" },
      { status: 400 },
    );
  }

  try {
    const result = await runDailyHarvestSlate({ userId, dryRun, force });
    return Response.json({
      ok: result.ok,
      skipped: result.skipped ?? false,
      reason: result.reason ?? null,
      dayId: result.doc?.dayId ?? null,
      codes: result.doc?.codes ?? result.plan?.codes ?? [],
      summary: result.doc?.summary ?? result.plan?.summary ?? null,
      added: result.doc?.added ?? result.plan?.added ?? [],
      removed: result.doc?.removed ?? result.plan?.removed ?? [],
      dryRun,
    });
  } catch (error) {
    console.error("[stocks/cron/daily-harvest-slate]", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "daily-harvest-slate failed",
      },
      { status: 500 },
    );
  }
}
