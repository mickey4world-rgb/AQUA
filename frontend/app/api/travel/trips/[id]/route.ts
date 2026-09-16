import { withApiAccessLog } from "@/lib/server/api-access";
import {
  deleteTravelTrip,
  getTravelTrip,
  isTravelStoreConfigured,
  updateTravelTrip,
} from "@/lib/server/travel-store";
import type { UpdateTravelTripRequest } from "@/lib/types/travel";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    const trip = await getTravelTrip(auth.userId, id);
    if (!trip) return Response.json({ error: "見つかりません" }, { status: 404 });
    return Response.json({ trip });
  });
}

export async function PATCH(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    let body: UpdateTravelTripRequest;
    try {
      body = (await request.json()) as UpdateTravelTripRequest;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    try {
      const trip = await updateTravelTrip(auth.userId, id, body);
      return Response.json({ trip });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "更新に失敗" },
        { status: 422 },
      );
    }
  });
}

export async function DELETE(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    try {
      await deleteTravelTrip(auth.userId, id);
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "削除に失敗" },
        { status: 422 },
      );
    }
  });
}
