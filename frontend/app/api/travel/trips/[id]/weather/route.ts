import { withApiAccessLog } from "@/lib/server/api-access";
import {
  getTravelTrip,
  isTravelStoreConfigured,
  replaceTravelStops,
} from "@/lib/server/travel-store";
import { attachWeatherToStops } from "@/lib/server/travel-weather";

export const maxDuration = 90;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    const trip = await getTravelTrip(auth.userId, id);
    if (!trip) return Response.json({ error: "見つかりません" }, { status: 404 });
    if (!trip.stops?.length) {
      return Response.json(
        { error: "地点がありません。手入力か資料判読を先に行ってください" },
        { status: 400 },
      );
    }

    let force = false;
    try {
      const body = (await request.json()) as { force?: boolean };
      force = body.force === true;
    } catch {
      // body optional
    }

    try {
      const weathered = await attachWeatherToStops(trip.stops, {
        force,
        tripStartDate: trip.startDate,
        tripEndDate: trip.endDate,
      });
      if (weathered.updated < 1) {
        const anyWeather = weathered.stops.some((s) => s.weather);
        if (!anyWeather && weathered.failed > 0) {
          return Response.json(
            {
              error:
                "天気を取得できませんでした。位置と日付がある地点があるか確認してください。",
              failed: weathered.failed,
            },
            { status: 422 },
          );
        }
        return Response.json({
          trip,
          weatherUpdated: 0,
          note: anyWeather
            ? "更新対象がありません（過去の実測は保持済み）"
            : "天気を付けられる地点がありません",
        });
      }
      const next = await replaceTravelStops(auth.userId, id, weathered.stops);
      return Response.json({
        trip: next,
        weatherUpdated: weathered.updated,
        failed: weathered.failed,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "天気取得に失敗" },
        { status: 422 },
      );
    }
  });
}
