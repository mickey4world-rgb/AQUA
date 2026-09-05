import { isDateNavigable } from "@/lib/server/disney-calendar-prediction";
import { buildPublicDayBriefing } from "@/lib/server/disney-public-preview";
import { getDisneyShowcaseSnapshot } from "@/lib/server/disney-showcase-cache";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";
import type { DisneyParkKey } from "@/lib/types/disney";

export const dynamic = "force-dynamic";

/** 認証不要 · 指定日の混雑予測（当日・翌日はスナップショット優先） */
export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-tdr-day",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
  const date = searchParams.get("date") ?? "";

  if (park !== "tdl" && park !== "tds") {
    return Response.json({ error: "Invalid park" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isDateNavigable(date)) {
    return Response.json({ error: "Date out of range" }, { status: 400 });
  }

  try {
    const showcase = await getDisneyShowcaseSnapshot({ allowRebuild: true });
    if (showcase) {
      const parkData = park === "tdl" ? showcase.tdl : showcase.tds;
      if (date === showcase.today) {
        return Response.json(parkData.today, {
          headers: {
            "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
            "X-TDR-Preview": "day-snapshot",
          },
        });
      }
      if (date === showcase.tomorrow) {
        return Response.json(parkData.tomorrow, {
          headers: {
            "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
            "X-TDR-Preview": "day-snapshot",
          },
        });
      }
    }

    // 当日・翌日以外はローカル予測のみ（外部ライブ取得なし）
    const payload = await buildPublicDayBriefing(park, date, { skipLiveFetch: true });
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        "X-TDR-Preview": "day-local",
      },
    });
  } catch (error) {
    console.error("[tdr-preview/day]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "日別予測の取得に失敗しました",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
