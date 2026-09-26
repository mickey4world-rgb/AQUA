import { getJstToday, shiftJstDate } from "@/lib/disney-holidays";
import { buildMarioEveningAdvice } from "@/lib/server/usj-character-advice";
import { predictUsjCrowdForDate } from "@/lib/server/usj-calendar-prediction";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";
import { USJ_PARK } from "@/lib/usj-constants";

export const dynamic = "force-dynamic";

function dayBrief(date: string) {
  const prediction = predictUsjCrowdForDate(date);
  const characterAdvice = buildMarioEveningAdvice(date, "preview");
  return {
    date,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: prediction.crowdLabel,
    crowdScore: prediction.crowdScore,
    estimatedWait: prediction.estimatedWait,
    characterAdvice: {
      characterNameJa: characterAdvice.characterNameJa,
      headline: characterAdvice.headline,
      crowdLevel: characterAdvice.crowdLevel,
      crowdScore: characterAdvice.crowdScore,
    },
  };
}

/** 公開SHOWCASE用。ルールベース予測のみ（ライブ待ち／AIなし）。 */
export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-usj-preview",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const today = getJstToday();
    const tomorrow = shiftJstDate(today, 1);
    return Response.json(
      {
        park: "usj",
        parkName: USJ_PARK.nameJa,
        fetchedAt: new Date().toISOString(),
        today: dayBrief(today),
        tomorrow: dayBrief(tomorrow),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.error("[usj-preview]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "USJ混雑予測の取得に失敗しました",
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
