import { warmDisneyShowcaseCache } from "@/lib/server/disney-showcase-cache";
import { finalizeYesterdayAccuracy } from "@/lib/server/disney-accuracy";
import { clearCalendarMonthCache } from "@/lib/server/disney-calendar-prediction";

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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let accuracyCount = 0;
    try {
      const accuracy = await finalizeYesterdayAccuracy();
      accuracyCount = accuracy.records.length;
      clearCalendarMonthCache();
    } catch (error) {
      console.warn("[tdr-preview/warm] accuracy finalize skipped", error);
    }

    const result = await warmDisneyShowcaseCache();
    return Response.json({ ok: true, accuracyCount, ...result });
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
