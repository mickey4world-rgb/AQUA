import { isDateNavigable } from "@/lib/server/disney-calendar-prediction";
import { buildPublicDayBriefing } from "@/lib/server/disney-public-preview";
import type { DisneyParkKey } from "@/lib/types/disney";

export const revalidate = 3600;

/** 認証不要 · 指定日の混雑予測（内訳・アトラクション・キャラアドバイス） */
export async function GET(request: Request) {
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
    const payload = await buildPublicDayBriefing(park, date, { skipLiveFetch: true });
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "X-TDR-Preview": "public",
      },
    });
  } catch (error) {
    console.error("[tdr-preview/day]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "日別予測の取得に失敗しました",
      },
      { status: 502 },
    );
  }
}
