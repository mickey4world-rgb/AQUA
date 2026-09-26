import { getJstToday } from "@/lib/disney-holidays";
import { withApiAccessLog } from "@/lib/server/api-access";
import {
  buildUsjCrowdStatus,
  buildUsjForecastStatus,
} from "@/lib/server/usj-analysis";
import { predictUsjCrowdForDate } from "@/lib/server/usj-calendar-prediction";
import { recordUsjWaitSnapshot } from "@/lib/server/usj-historical-store";
import { fetchParkLiveData } from "@/lib/server/themeparks-api";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = getJstToday();
    const targetDate = date ?? today;

    try {
      if (targetDate !== today) {
        const prediction = predictUsjCrowdForDate(targetDate);
        return Response.json({
          park: "usj",
          date: targetDate,
          mode: "forecast" as const,
          status: buildUsjForecastStatus(prediction),
          prediction,
          attractions: [],
        });
      }

      const [attractions, status] = await Promise.all([
        fetchParkLiveData("usj"),
        buildUsjCrowdStatus(),
      ]);
      void recordUsjWaitSnapshot(attractions).catch(() => undefined);
      const prediction = predictUsjCrowdForDate(today);

      return Response.json({
        park: "usj",
        date: today,
        mode: "live" as const,
        status,
        prediction: { ...prediction, mode: "live" as const },
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
