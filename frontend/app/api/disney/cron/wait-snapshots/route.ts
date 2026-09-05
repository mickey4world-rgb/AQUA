import { collectLiveWaitSnapshotsNow } from "@/lib/server/disney-historical-store";
import { backfillPastAccuracy } from "@/lib/server/disney-accuracy";
import { clearCalendarMonthCache } from "@/lib/server/disney-calendar-prediction";
import { recordSecurityEvent } from "@/lib/server/security-event";

export const maxDuration = 120;

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  return request.headers.get("x-soluna-cron-secret")?.trim() === secret;
}

/**
 * 毎時: 両園のライブ待ちをスナップショット保存
 * ?backfill=1 : 過去表示範囲の経験シード＋的中評価も実行
 */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "Disney待ち時間収集への不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const doBackfill =
    url.searchParams.get("backfill") === "1" ||
    url.searchParams.get("seed") === "1";

  try {
    const live = await collectLiveWaitSnapshotsNow();
    let backfill: Awaited<ReturnType<typeof backfillPastAccuracy>> | null = null;
    if (doBackfill) {
      backfill = await backfillPastAccuracy();
      clearCalendarMonthCache();
    }

    return Response.json({
      ok: true,
      live,
      backfill: backfill
        ? {
            seededDays: backfill.seededDays,
            accuracyCount: backfill.records.length,
          }
        : null,
    });
  } catch (error) {
    console.error("[disney/cron/wait-snapshots]", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "cron failed",
      },
      { status: 503 },
    );
  }
}
