import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import { parseTravelMaterial } from "@/lib/server/travel-parse";
import {
  getTravelTrip,
  isTravelStoreConfigured,
  replaceTravelStops,
  updateTravelTrip,
} from "@/lib/server/travel-store";
import { attachWeatherToStops } from "@/lib/server/travel-weather";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    const trip = await getTravelTrip(auth.userId, id);
    if (!trip) return Response.json({ error: "見つかりません" }, { status: 404 });

    let body: { text?: string };
    try {
      body = (await request.json()) as { text?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const text = sanitizeText(body.text ?? "", 12000);
    if (!text) {
      return Response.json({ error: "資料テキストを送ってください" }, { status: 400 });
    }

    try {
      const parsed = await parseTravelMaterial({
        text,
        destinationHint: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
      });

      const weathered = await attachWeatherToStops(parsed.stops, {
        tripStartDate: trip.startDate,
        tripEndDate: trip.endDate,
      });

      let next = await replaceTravelStops(
        auth.userId,
        id,
        weathered.stops,
        text.slice(0, 1500),
      );
      if (parsed.tripTitle || parsed.summary) {
        next = await updateTravelTrip(auth.userId, id, {
          title: parsed.tripTitle || undefined,
          summary: parsed.summary || undefined,
        });
      }
      return Response.json({
        trip: next,
        parsedStopCount: parsed.stops.length,
        weatherUpdated: weathered.updated,
        provider: parsed.provider,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "解析に失敗しました" },
        { status: 422 },
      );
    }
  });
}
