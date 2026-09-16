/**
 * ブラウザから直接ジオコード（CORS 可）。SWA サーバー経由が空振りしても地図ピンを付ける。
 */
import type { TravelStop } from "@/lib/types/travel";

export type ClientGeocodeHit = {
  lat: number;
  lon: number;
  displayName?: string;
};

function cleanQuery(query: string): string {
  return query
    .replace(/\d{1,2}:\d{2}/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/[◆●・■□]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function photon(query: string): Promise<ClientGeocodeHit | null> {
  const url = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: { name?: string; city?: string; state?: string; country?: string };
    }>;
  };
  const feat = data.features?.[0];
  const coords = feat?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = feat?.properties;
  return {
    lat,
    lon,
    displayName: [p?.name, p?.city, p?.state, p?.country].filter(Boolean).join(", "),
  };
}

async function openMeteo(query: string): Promise<ClientGeocodeHit | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=1&language=ja&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: Array<{
      latitude?: number;
      longitude?: number;
      name?: string;
      admin1?: string;
      country?: string;
    }>;
  };
  const hit = data.results?.[0];
  if (hit?.latitude == null || hit?.longitude == null) return null;
  return {
    lat: Number(hit.latitude),
    lon: Number(hit.longitude),
    displayName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
  };
}

export async function geocodeQueryInBrowser(
  query: string,
): Promise<ClientGeocodeHit | null> {
  const q = cleanQuery(query);
  if (!q) return null;
  try {
    return (await photon(q)) || (await openMeteo(q));
  } catch {
    return null;
  }
}

export function buildStopGeocodeQuery(
  stop: TravelStop,
  destinationHint?: string,
): string {
  return [destinationHint, stop.name, stop.address].filter(Boolean).join(" ");
}

/**
 * 座標のない地点へブラウザから座標を付与。最大 maxCount 件。
 */
export async function geocodeStopsInBrowser(
  stops: TravelStop[],
  options?: {
    destinationHint?: string;
    maxCount?: number;
    onProgress?: (done: number, total: number, name: string) => void;
  },
): Promise<{ stops: TravelStop[]; updated: number }> {
  const maxCount = options?.maxCount ?? 20;
  const need = stops.filter((s) => s.lat == null || s.lon == null);
  const targets = need.slice(0, maxCount);
  const byId = new Map(stops.map((s) => [s.id, { ...s }]));
  let updated = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const stop = targets[i]!;
    options?.onProgress?.(i + 1, targets.length, stop.name);
    const query = buildStopGeocodeQuery(stop, options?.destinationHint);
    const hit = await geocodeQueryInBrowser(query);
    if (hit) {
      const cur = byId.get(stop.id);
      if (cur) {
        byId.set(stop.id, {
          ...cur,
          lat: hit.lat,
          lon: hit.lon,
          address: cur.address || hit.displayName,
        });
        updated += 1;
      }
    }
    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    stops: stops.map((s) => byId.get(s.id) ?? s),
    updated,
  };
}
