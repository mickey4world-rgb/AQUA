/**
 * Travel trips — Cosmos（SolunaRecords 共用・docType で分離）
 * partition key: /userId（Soluna 画像と同じ）
 */
import { randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { sanitizeText } from "@/lib/server/security";
import type {
  CreateTravelTripRequest,
  TravelJournalEntry,
  TravelStop,
  TravelTrip,
  TravelTripListItem,
  UpdateTravelTripRequest,
} from "@/lib/types/travel";

const DOC_TYPE = "travelTrip";
const MAX_JOURNAL_PHOTO_BYTES = 850_000;
const MAX_JOURNAL_ENTRIES = 80;
const MAX_STOPS = 80;

type StoredTrip = TravelTrip & { docType: typeof DOC_TYPE };

function container() {
  return getContainer(COSMOS_CONTAINERS.solunaRecords);
}

export function isTravelStoreConfigured(): boolean {
  return isCosmosConfigured();
}

function toListItem(trip: TravelTrip): TravelTripListItem {
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    stopCount: trip.stops?.length ?? 0,
    journalCount: trip.journal?.length ?? 0,
    updatedAt: trip.updatedAt,
  };
}

function stripDoc(doc: StoredTrip): TravelTrip {
  const { docType: _d, ...trip } = doc;
  return trip;
}

export async function listTravelTrips(userId: string): Promise<TravelTripListItem[]> {
  const { resources } = await container()
    .items.query<StoredTrip>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType ORDER BY c.updatedAt DESC",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@docType", value: DOC_TYPE },
      ],
    })
    .fetchAll();
  return resources.map((r) => toListItem(stripDoc(r)));
}

export async function getTravelTrip(
  userId: string,
  id: string,
): Promise<TravelTrip | null> {
  try {
    const { resource } = await container().item(id, userId).read<StoredTrip>();
    if (!resource || resource.docType !== DOC_TYPE) return null;
    return stripDoc(resource);
  } catch {
    return null;
  }
}

export async function createTravelTrip(
  userId: string,
  input: CreateTravelTripRequest,
): Promise<TravelTrip> {
  const now = new Date().toISOString();
  const trip: StoredTrip = {
    id: randomUUID(),
    userId,
    title: sanitizeText(input.title, 120) || "無題の旅",
    destination: sanitizeText(input.destination, 120) || "",
    startDate: sanitizeText(input.startDate, 32),
    endDate: sanitizeText(input.endDate, 32),
    summary: input.summary ? sanitizeText(input.summary, 800) : undefined,
    stops: [],
    journal: [],
    createdAt: now,
    updatedAt: now,
    docType: DOC_TYPE,
  };
  await container().items.create(trip);
  return stripDoc(trip);
}

export async function updateTravelTrip(
  userId: string,
  id: string,
  patch: UpdateTravelTripRequest,
): Promise<TravelTrip> {
  const existing = await getTravelTrip(userId, id);
  if (!existing) throw new Error("旅行が見つかりません");

  const next: StoredTrip = {
    ...existing,
    title:
      patch.title !== undefined
        ? sanitizeText(patch.title, 120) || existing.title
        : existing.title,
    destination:
      patch.destination !== undefined
        ? sanitizeText(patch.destination, 120)
        : existing.destination,
    startDate:
      patch.startDate !== undefined
        ? sanitizeText(patch.startDate, 32)
        : existing.startDate,
    endDate:
      patch.endDate !== undefined ? sanitizeText(patch.endDate, 32) : existing.endDate,
    summary:
      patch.summary !== undefined
        ? sanitizeText(patch.summary, 800) || undefined
        : existing.summary,
    stops:
      patch.stops !== undefined
        ? patch.stops.slice(0, MAX_STOPS).map(normalizeStop)
        : existing.stops,
    updatedAt: new Date().toISOString(),
    docType: DOC_TYPE,
  };
  await container().items.upsert(next);
  return stripDoc(next);
}

function normalizeWeather(
  weather: TravelStop["weather"] | undefined,
): TravelStop["weather"] | undefined {
  if (!weather?.date || !weather.source || !weather.fetchedAt) return undefined;
  return {
    date: sanitizeText(weather.date, 32),
    source: weather.source === "archive" ? "archive" : "forecast",
    label: sanitizeText(weather.label || "不明", 80),
    weatherCode:
      typeof weather.weatherCode === "number" ? weather.weatherCode : undefined,
    tempMaxC: typeof weather.tempMaxC === "number" ? weather.tempMaxC : undefined,
    tempMinC: typeof weather.tempMinC === "number" ? weather.tempMinC : undefined,
    humidityPct:
      typeof weather.humidityPct === "number" ? weather.humidityPct : undefined,
    precipMm: typeof weather.precipMm === "number" ? weather.precipMm : undefined,
    precipProbPct:
      typeof weather.precipProbPct === "number" ? weather.precipProbPct : undefined,
    windMaxKmh:
      typeof weather.windMaxKmh === "number" ? weather.windMaxKmh : undefined,
    uvIndexMax:
      typeof weather.uvIndexMax === "number" ? weather.uvIndexMax : undefined,
    fetchedAt: sanitizeText(weather.fetchedAt, 40),
  };
}

function normalizeStop(stop: TravelStop): TravelStop {
  return {
    id: stop.id || randomUUID(),
    dayIndex: Number.isFinite(stop.dayIndex) ? Math.max(0, Math.floor(stop.dayIndex)) : 0,
    order: Number.isFinite(stop.order) ? Math.max(0, Math.floor(stop.order)) : 0,
    name: sanitizeText(stop.name, 120) || "スポット",
    kind: stop.kind ?? "other",
    date: stop.date ? sanitizeText(stop.date, 32) : undefined,
    timeLabel: stop.timeLabel ? sanitizeText(stop.timeLabel, 32) : undefined,
    address: stop.address ? sanitizeText(stop.address, 200) : undefined,
    lat: typeof stop.lat === "number" ? stop.lat : undefined,
    lon: typeof stop.lon === "number" ? stop.lon : undefined,
    note: stop.note ? sanitizeText(stop.note, 600) : undefined,
    transportMode: stop.transportMode,
    sourceSnippet: stop.sourceSnippet ? sanitizeText(stop.sourceSnippet, 400) : undefined,
    tip: stop.tip ? sanitizeText(stop.tip, 600) : undefined,
    recommendReason: stop.recommendReason
      ? sanitizeText(stop.recommendReason, 400)
      : undefined,
    externalUrl: stop.externalUrl ? sanitizeText(stop.externalUrl, 400) : undefined,
    weather: normalizeWeather(stop.weather),
  };
}

export async function addTravelStop(
  userId: string,
  tripId: string,
  stop: TravelStop,
): Promise<TravelTrip> {
  const existing = await getTravelTrip(userId, tripId);
  if (!existing) throw new Error("旅行が見つかりません");
  if ((existing.stops?.length ?? 0) >= MAX_STOPS) {
    throw new Error(`地点上限（${MAX_STOPS}）に達しています`);
  }
  const nextStop = normalizeStop({
    ...stop,
    order:
      stop.order ??
      (existing.stops.length
        ? Math.max(...existing.stops.map((s) => s.order)) + 1
        : 0),
  });
  const next: StoredTrip = {
    ...existing,
    stops: [...(existing.stops ?? []), nextStop],
    updatedAt: new Date().toISOString(),
    docType: DOC_TYPE,
  };
  await container().items.upsert(next);
  return stripDoc(next);
}

export async function replaceTravelStops(
  userId: string,
  id: string,
  stops: TravelStop[],
  sourceExcerpt?: string,
): Promise<TravelTrip> {
  const existing = await getTravelTrip(userId, id);
  if (!existing) throw new Error("旅行が見つかりません");
  const next: StoredTrip = {
    ...existing,
    stops: stops.slice(0, MAX_STOPS).map(normalizeStop),
    sourceMaterialExcerpt: sourceExcerpt
      ? sanitizeText(sourceExcerpt, 2000)
      : existing.sourceMaterialExcerpt,
    updatedAt: new Date().toISOString(),
    docType: DOC_TYPE,
  };
  await container().items.upsert(next);
  return stripDoc(next);
}

export async function addTravelJournalEntry(
  userId: string,
  tripId: string,
  input: { body: string; stopId?: string; photoDataUrl?: string },
): Promise<TravelTrip> {
  const existing = await getTravelTrip(userId, tripId);
  if (!existing) throw new Error("旅行が見つかりません");
  if ((existing.journal?.length ?? 0) >= MAX_JOURNAL_ENTRIES) {
    throw new Error(`ジャーナル上限（${MAX_JOURNAL_ENTRIES}件）に達しています`);
  }

  let photoDataUrl: string | undefined;
  let photoByteSize: number | undefined;
  if (input.photoDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(
      input.photoDataUrl,
    );
    if (!match) throw new Error("写真は data URL 形式で送ってください");
    const buf = Buffer.from(match[2]!, "base64");
    if (buf.byteLength > MAX_JOURNAL_PHOTO_BYTES) {
      throw new Error(
        `写真が大きすぎます（最大約 ${Math.round(MAX_JOURNAL_PHOTO_BYTES / 1024)}KB）。圧縮してから送ってください。`,
      );
    }
    photoDataUrl = input.photoDataUrl;
    photoByteSize = buf.byteLength;
  }

  const entry: TravelJournalEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    body: sanitizeText(input.body, 2000) || "（メモ）",
    stopId: input.stopId ? sanitizeText(input.stopId, 64) : undefined,
    photoDataUrl,
    photoByteSize,
  };

  const next: StoredTrip = {
    ...existing,
    journal: [entry, ...(existing.journal ?? [])],
    updatedAt: new Date().toISOString(),
    docType: DOC_TYPE,
  };
  await container().items.upsert(next);
  return stripDoc(next);
}

export async function deleteTravelTrip(userId: string, id: string): Promise<void> {
  const existing = await getTravelTrip(userId, id);
  if (!existing) throw new Error("旅行が見つかりません");
  await container().item(id, userId).delete();
}
