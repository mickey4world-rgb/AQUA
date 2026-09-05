import { warmDisneyShowcaseCache } from "@/lib/server/disney-showcase-cache";
import { backfillPastAccuracy } from "@/lib/server/disney-accuracy";
import { collectLiveWaitSnapshotsNow } from "@/lib/server/disney-historical-store";
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

/** 0:05 JST など cron から公開キャッシュを事前生成（重い処理をピークから分離） */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "公開キャッシュ更新APIへの不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let liveHour: number | null = null;
    try {
      const live = await collectLiveWaitSnapshotsNow();
      liveHour = live.hour;
    } catch (error) {
      console.warn("[tdr-preview/warm] live wait snapshot skipped", error);
    }

    let accuracyCount = 0;
    let seededDays = 0;
    try {
      const accuracy = await backfillPastAccuracy();
      accuracyCount = accuracy.records.length;
      seededDays = accuracy.seededDays;
      clearCalendarMonthCache();
    } catch (error) {
      console.warn("[tdr-preview/warm] accuracy backfill skipped", error);
    }

    const result = await warmDisneyShowcaseCache();
    return Response.json({
      ok: true,
      accuracyCount,
      seededDays,
      liveHour,
      ...result,
    });
  } catch (error) {
    console.error("[tdr-preview/warm]", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "warm failed",
      },
      { status: 503 },
    );
  }
}
