import { getJstToday } from "@/lib/disney-holidays";
import { buildMarioEveningAdvice } from "@/lib/server/usj-character-advice";
import { predictUsjCrowdForDate } from "@/lib/server/usj-calendar-prediction";
import { buildUsjCrowdBreakdown } from "@/lib/server/usj-crowd-breakdown";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";
import { USJ_PARK } from "@/lib/usj-constants";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 認証不要 · 指定日のUSJ混雑＋マリオ―アドバイス */
export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-usj-day",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? getJstToday();
  if (!DATE_RE.test(date)) {
    return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const prediction = predictUsjCrowdForDate(date);
    const characterAdvice = buildMarioEveningAdvice(date, "preview");
    const breakdown = buildUsjCrowdBreakdown(date);
    return Response.json(
      {
        park: "usj",
        parkName: USJ_PARK.nameJa,
        date,
        crowdLevel: prediction.crowdLevel,
        crowdLabel: prediction.crowdLabel,
        crowdScore: prediction.crowdScore,
        estimatedWait: prediction.estimatedWait,
        factors: prediction.factors,
        description: prediction.description,
        characterAdvice,
        breakdown,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.error("[usj-preview/day]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "USJ日次予測の取得に失敗しました",
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
