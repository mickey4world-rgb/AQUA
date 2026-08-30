import { getJstToday } from "@/lib/disney-holidays";
import { withApiAccessLog } from "@/lib/server/api-access";
import { buildDayForecast } from "@/lib/server/disney-hourly-forecast";
import { fetchParkLiveData } from "@/lib/server/themeparks-api";
import type { DisneyParkKey } from "@/lib/types/disney";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
    const date = searchParams.get("date") ?? getJstToday();

    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }
    if (!DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    try {
      const today = getJstToday();
      const liveAttractions =
        date === today ? await fetchParkLiveData(park).catch(() => []) : [];
      const forecast = await buildDayForecast(park, date, liveAttractions);
      return Response.json(forecast);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "時間帯予測の取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
