import { isCosmosConfigured } from "@/lib/server/cosmos";
import { authorizeStockBridge } from "@/lib/server/stock-broker";
import { recordSecurityEvent } from "@/lib/server/security-event";
import { runWeeklyUniverseReview } from "@/lib/server/stock-weekly-universe-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 週末 JP ウォッチ自動シード / 一部入れ替え。
 * Bearer: STOCK_KABU_BRIDGE_SECRET または SOLUNA_CRON_SECRET
 * userId: STOCK_AUTO_TRADE_USER_ID または body/query
 */
function authorizeWeeklyCron(request: Request): boolean {
  if (authorizeStockBridge(request)) return true;
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  return header === `Bearer ${secret}`;
}

function resolveUserId(request: Request, bodyUserId?: string): string | null {
  const fromEnv = process.env.STOCK_AUTO_TRADE_USER_ID?.trim();
  const fromQuery = new URL(request.url).searchParams.get("userId")?.trim();
  const fromBody = bodyUserId?.trim();
  return fromBody || fromQuery || fromEnv || null;
}

export async function POST(request: Request) {
  if (!authorizeWeeklyCron(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "株週末ユニバース見直しへの不正アクセス",
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
      {
        error:
          "userId が必要です（STOCK_AUTO_TRADE_USER_ID または body/query userId）",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runWeeklyUniverseReview({ userId, dryRun, force });
    return Response.json({
      ok: result.ok,
      skipped: result.skipped === true,
      reason: result.reason,
      weekId: result.review.weekId,
      applied: result.review.applied,
      dryRun: result.review.dryRun,
      summary: result.review.summary,
      desiredActiveCodes: result.review.desiredActiveCodes,
      actions: result.review.actions,
      appliedActions: result.review.appliedActions,
      topScores: result.review.scores.slice(0, 12),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "週末ユニバース見直しに失敗しました",
      },
      { status: 502 },
    );
  }
}

/** 直近レビュー確認（同じ認証） */
export async function GET(request: Request) {
  if (!authorizeWeeklyCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "userId が必要です" }, { status: 400 });
  }
  const { getLatestWeeklyUniverseReview } = await import(
    "@/lib/server/stock-weekly-universe-review"
  );
  const review = await getLatestWeeklyUniverseReview(userId);
  return Response.json({ ok: true, review });
}
