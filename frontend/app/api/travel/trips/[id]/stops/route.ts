import { randomUUID } from "crypto";
import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import { geocodePlace } from "@/lib/server/travel-parse";
import {
  addTravelStop,
  getTravelTrip,
  isTravelStoreConfigured,
} from "@/lib/server/travel-store";
import { attachWeatherToStops } from "@/lib/server/travel-weather";
import type {
  AddTravelStopRequest,
  TravelStop,
  TravelStopKind,
  TravelTransportMode,
} from "@/lib/types/travel";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const KIND_SET = new Set<TravelStopKind>([
  "sight",
  "meal",
  "hotel",
  "transport",
  "free",
  "other",
]);

const TRANSPORT_SET = new Set<TravelTransportMode>([
  "walk",
  "train",
  "bus",
  "car",
  "taxi",
  "plane",
  "ship",
  "bike",
  "other",
]);

export async function POST(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    const trip = await getTravelTrip(auth.userId, id);
    if (!trip) return Response.json({ error: "見つかりません" }, { status: 404 });

    let body: AddTravelStopRequest;
    try {
      body = (await request.json()) as AddTravelStopRequest;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = sanitizeText(body.name ?? "", 120);
    if (!name) {
      return Response.json({ error: "地点名は必須です" }, { status: 400 });
    }

    const kindRaw = (body.kind || "sight") as TravelStopKind;
    const kind = KIND_SET.has(kindRaw) ? kindRaw : "sight";
    const transportRaw = body.transportMode as TravelTransportMode | undefined;
    const transportMode =
      transportRaw && TRANSPORT_SET.has(transportRaw)
        ? transportRaw
        : kind === "transport"
          ? ("other" as const)
          : undefined;

    let lat = typeof body.lat === "number" ? body.lat : undefined;
    let lon = typeof body.lon === "number" ? body.lon : undefined;
    let address = body.address ? sanitizeText(body.address, 200) : undefined;

    if (lat == null || lon == null) {
      const query =
        sanitizeText(body.geocodeQuery ?? "", 160) ||
        [trip.destination, name, address].filter(Boolean).join(" ");
      const geo = await geocodePlace(query);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        if (!address && geo.displayName) {
          address = sanitizeText(geo.displayName, 200);
        }
      }
    }

    const dayIndex = Number.isFinite(body.dayIndex)
      ? Math.max(0, Math.floor(Number(body.dayIndex)))
      : 0;
    const date =
      (body.date && sanitizeText(body.date, 32)) ||
      trip.startDate ||
      undefined;

    let stop: TravelStop = {
      id: randomUUID(),
      dayIndex,
      order: Number.isFinite(body.order) ? Number(body.order) : dayIndex * 10,
      name,
      kind,
      transportMode,
      date,
      timeLabel: body.timeLabel ? sanitizeText(body.timeLabel, 32) : undefined,
      address,
      lat,
      lon,
      note: body.note ? sanitizeText(body.note, 600) : undefined,
    };

    if (lat != null && lon != null && date) {
      const weathered = await attachWeatherToStops([stop], {
        tripStartDate: trip.startDate,
        tripEndDate: trip.endDate,
      });
      stop = weathered.stops[0]!;
    }

    try {
      const next = await addTravelStop(auth.userId, id, stop);
      return Response.json({ trip: next, stop }, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "地点の追加に失敗" },
        { status: 422 },
      );
    }
  });
}
