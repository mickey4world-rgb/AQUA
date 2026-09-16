import { withApiAccessLog } from "@/lib/server/api-access";
import { geocodeTravelStops } from "@/lib/server/travel-parse";
import {
  getTravelTrip,
  isTravelStoreConfigured,
  replaceTravelStops,
} from "@/lib/server/travel-store";

export const maxDuration = 55;

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
        { error: "地点がありません。先に RAG 判読してください。" },
        { status: 400 },
      );
    }

    let maxGeocode = 8;
    try {
      const body = (await request.json()) as { maxGeocode?: number };
      if (typeof body.maxGeocode === "number" && body.maxGeocode > 0) {
        maxGeocode = Math.min(12, Math.floor(body.maxGeocode));
      }
    } catch {
      // optional body
    }

    try {
      const { stops, updated } = await geocodeTravelStops(trip.stops, {
        destinationHint: trip.destination,
        maxGeocode,
      });
      if (updated < 1) {
        const stillMissing = stops.filter((s) => s.lat == null).length;
        return Response.json({
          trip,
          geocodeUpdated: 0,
          stillMissing,
          note:
            stillMissing > 0
              ? "新たに座標を付けられませんでした（地名が曖昧な可能性があります）"
              : "すべての地点に座標があります",
        });
      }
      const next = await replaceTravelStops(auth.userId, id, stops);
      return Response.json({
        trip: next,
        geocodeUpdated: updated,
        stillMissing: next.stops.filter((s) => s.lat == null).length,
      });
    } catch (err) {
      console.error("[travel-geocode] failed", err);
      return Response.json(
        {
          error:
            err instanceof Error ? err.message : "地図座標の取得に失敗しました",
        },
        { status: 422 },
      );
    }
  });
}
