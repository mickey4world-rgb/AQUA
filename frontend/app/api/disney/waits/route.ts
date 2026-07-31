import { getJstToday } from "@/lib/disney-holidays";
import { withApiAccessLog } from "@/lib/server/api-access";
import {
  buildForecastStatus,
  buildParkCrowdStatus,
  predictDailyCrowd,
} from "@/lib/server/disney-analysis";
import { predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import { fetchParkLiveData } from "@/lib/server/themeparks-api";
import type { DisneyParkKey } from "@/lib/types/disney";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
    const date = searchParams.get("date");

    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }

    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = getJstToday();
    const targetDate = date ?? today;

    try {
      if (targetDate !== today) {
        const prediction = predictCrowdForDate(park, targetDate);
        const status = buildForecastStatus(park, prediction);
        return Response.json({
          park,
          date: targetDate,
          mode: "forecast" as const,
          status,
          prediction,
          attractions: [],
        });
      }

      const [attractions, status] = await Promise.all([
        fetchParkLiveData(park),
        buildParkCrowdStatus(park),
      ]);

      return Response.json({
        park,
        date: today,
        mode: "live" as const,
        status,
        prediction: predictDailyCrowd(park, status, today),
        attractions,
      });
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "待ち時間の取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
