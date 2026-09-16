import { withApiAccessLog } from "@/lib/server/api-access";
import {
  createTravelTrip,
  isTravelStoreConfigured,
  listTravelTrips,
} from "@/lib/server/travel-store";
import type { CreateTravelTripRequest } from "@/lib/types/travel";

export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため Travel を利用できません。" },
        { status: 503 },
      );
    }
    const trips = await listTravelTrips(auth.userId);
    return Response.json({ trips });
  });
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため Travel を利用できません。" },
        { status: 503 },
      );
    }
    let body: CreateTravelTripRequest;
    try {
      body = (await request.json()) as CreateTravelTripRequest;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body.title?.trim() || !body.startDate || !body.endDate) {
      return Response.json(
        { error: "title / startDate / endDate は必須です" },
        { status: 400 },
      );
    }
    const trip = await createTravelTrip(auth.userId, body);
    return Response.json({ trip }, { status: 201 });
  });
}
