import { finalizeYesterdayAccuracy } from "@/lib/server/disney-accuracy";
import { runMonthlyCrowdReview } from "@/lib/server/disney-monthly-review";
import { clearCalendarMonthCache } from "@/lib/server/disney-calendar-prediction";

export const maxDuration = 120;

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  return request.headers.get("x-soluna-cron-secret")?.trim() === secret;
}

/**
 * 日次: 昨日の予測 vs 実績を記録
 * 月初（または ?monthly=1）: 的中率が低い場合にニュース調査→条件自動見直し
 */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceMonthly =
    url.searchParams.get("monthly") === "1" ||
    url.searchParams.get("force") === "1";

  try {
    const accuracy = await finalizeYesterdayAccuracy();
    clearCalendarMonthCache();

    const jst = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
    );
    const isMonthStart = jst.getDate() === 1;
    let review = null;
    if (forceMonthly || isMonthStart) {
      review = await runMonthlyCrowdReview({ force: forceMonthly });
      clearCalendarMonthCache();
    }

    return Response.json({
      ok: true,
      accuracyCount: accuracy.records.length,
      accuracyDates: accuracy.records.map((r) => `${r.park}:${r.date}`),
      review: review
        ? {
            month: review.month,
            hitRate: review.hitRate,
            summary: review.summary,
            rulesAdded: review.rulesAdded.length,
            rulesUpdated: review.rulesUpdated.length,
          }
        : null,
    });
  } catch (error) {
    console.error("[disney/cron/accuracy-review]", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "cron failed",
      },
      { status: 503 },
    );
  }
}
