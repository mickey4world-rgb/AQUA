import { withApiAccessLog } from "@/lib/server/api-access";
import { enrichTravelStops } from "@/lib/server/travel-parse";
import {
  getTravelTrip,
  isTravelStoreConfigured,
  replaceTravelStops,
} from "@/lib/server/travel-store";

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
        { error: "先に資料からコースを取り込むか、地点を手入力してください" },
        { status: 400 },
      );
    }

    try {
      const enriched = await enrichTravelStops(trip.stops);
      const next = await replaceTravelStops(auth.userId, id, enriched.stops);
      return Response.json({ trip: next, provider: enriched.provider });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "提案に失敗しました" },
        { status: 422 },
      );
    }
  });
}
