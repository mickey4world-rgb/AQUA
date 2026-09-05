import { warmDisneyShowcaseCache } from "@/lib/server/disney-showcase-cache";
import { backfillPastAccuracy } from "@/lib/server/disney-accuracy";
import { collectLiveWaitSnapshotsNow } from "@/lib/server/disney-historical-store";
import { clearCalendarMonthCache } from "@/lib/server/disney-calendar-prediction";
import { recordSecurityEvent } from "@/lib/server/security-event";

/**
 * SWA マネージド API の実効上限は短い。
 * core（ショーケース永続化）を既定にし、重い付帯処理は mode で分離する。
 */
export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  return request.headers.get("x-soluna-cron-secret")?.trim() === secret;
}

type WarmMode = "core" | "calendars" | "extras" | "full";

type WarmBody = {
  mode?: WarmMode;
};

function resolveMode(request: Request, body: WarmBody): WarmMode {
  const fromQuery = new URL(request.url).searchParams.get("mode");
  const raw = (body.mode ?? fromQuery ?? "core").toLowerCase();
  if (raw === "calendars" || raw === "extras" || raw === "full" || raw === "core") {
    return raw;
  }
  return "core";
}

/** cron / デプロイ後ウォーム。既定は core のみ（公開GETの不変条件を最速で満たす）。 */
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

  let body: WarmBody = {};
  try {
    body = (await request.json()) as WarmBody;
  } catch {
    body = {};
  }
  const mode = resolveMode(request, body);
  const started = Date.now();

  try {
    if (mode === "extras") {
      let liveHour: number | null = null;
      let accuracyCount = 0;
      let seededDays = 0;
      try {
        const live = await collectLiveWaitSnapshotsNow();
        liveHour = live.hour;
      } catch (error) {
        console.warn("[tdr-preview/warm] live wait snapshot skipped", error);
      }
      try {
        const accuracy = await backfillPastAccuracy({ skipExisting: true });
        accuracyCount = accuracy.records.length;
        seededDays = accuracy.seededDays;
        clearCalendarMonthCache();
      } catch (error) {
        console.warn("[tdr-preview/warm] accuracy backfill skipped", error);
      }
      return Response.json({
        ok: true,
        mode,
        liveHour,
        accuracyCount,
        seededDays,
        elapsedMs: Date.now() - started,
      });
    }

    if (mode === "calendars") {
      const result = await warmDisneyShowcaseCache({ includeCalendars: true });
      return Response.json({
        ok: true,
        ...result,
        elapsedMs: Date.now() - started,
      });
    }

    if (mode === "full") {
      // full でも先に core 相当を完了させてから付帯（途中タイムアウトでも公開は救う）
      const core = await warmDisneyShowcaseCache({ includeCalendars: false });
      let liveHour: number | null = null;
      let accuracyCount = 0;
      let seededDays = 0;
      let calendars: Awaited<ReturnType<typeof warmDisneyShowcaseCache>> | null = null;
      try {
        const live = await collectLiveWaitSnapshotsNow();
        liveHour = live.hour;
      } catch (error) {
        console.warn("[tdr-preview/warm] live wait snapshot skipped", error);
      }
      try {
        const accuracy = await backfillPastAccuracy({ skipExisting: true });
        accuracyCount = accuracy.records.length;
        seededDays = accuracy.seededDays;
        clearCalendarMonthCache();
      } catch (error) {
        console.warn("[tdr-preview/warm] accuracy backfill skipped", error);
      }
      try {
        calendars = await warmDisneyShowcaseCache({ includeCalendars: true });
      } catch (error) {
        console.warn("[tdr-preview/warm] calendars phase skipped", error);
      }
      return Response.json({
        ok: true,
        mode,
        core,
        calendars,
        liveHour,
        accuracyCount,
        seededDays,
        elapsedMs: Date.now() - started,
      });
    }

    // default: core
    const result = await warmDisneyShowcaseCache({ includeCalendars: false });
    return Response.json({
      ok: true,
      ...result,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    console.error("[tdr-preview/warm]", mode, error);
    return Response.json(
      {
        ok: false,
        mode,
        error: error instanceof Error ? error.message : "warm failed",
        elapsedMs: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
