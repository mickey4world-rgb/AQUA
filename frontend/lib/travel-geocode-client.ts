/**
 * ブラウザから直接ジオコード（CORS 可）。
 * 住所ヒントで Photon 複数候補を選別し、誤爆（風連町 vs 風蓮湖）を避ける。
 */
import type { TravelStop } from "@/lib/types/travel";
import {
  buildGeocodeCandidates,
  extractAddressHints,
  pickBestPhotonFeature,
  resolveLocalTravelPlace,
  type PhotonFeatureLike,
} from "@/lib/travel-geocode-query";

export type ClientGeocodeHit = {
  lat: number;
  lon: number;
  displayName?: string;
};

async function photon(
  query: string,
  addressHints: string[] = [],
): Promise<ClientGeocodeHit | null> {
  const url = `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: PhotonFeatureLike[] };
  const feat = pickBestPhotonFeature(data.features, addressHints);
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

async function resolveStopHit(
  stop: TravelStop,
  destinationHint?: string,
): Promise<ClientGeocodeHit | null> {
  const hints = extractAddressHints(stop.address);
  const candidates = buildGeocodeCandidates(stop, destinationHint);
  const blob = [stop.name, stop.address, stop.note, stop.sourceSnippet]
    .filter(Boolean)
    .join(" ");

  if (stop.address) {
    for (const q of candidates) {
      try {
        const hit = (await photon(q, hints)) || (await openMeteo(q));
        if (hit) return hit;
      } catch {
        // next
      }
    }
  }

  const local = resolveLocalTravelPlace(blob);
  if (local) {
    return { lat: local.lat, lon: local.lon, displayName: local.label };
  }

  for (const q of candidates) {
    try {
      const hit = (await photon(q, hints)) || (await openMeteo(q));
      if (hit) return hit;
    } catch {
      // next
    }
  }
  return null;
}

export async function geocodeQueryInBrowser(
  query: string,
  destinationHint?: string,
): Promise<ClientGeocodeHit | null> {
  return resolveStopHit(
    { id: "tmp", dayIndex: 0, order: 0, name: query, kind: "other" },
    destinationHint,
  );
}

export function buildStopGeocodeQuery(
  stop: TravelStop,
  destinationHint?: string,
): string {
  return buildGeocodeCandidates(stop, destinationHint)[0] || stop.name;
}

/**
 * 1地点だけ座標を付け直す（既存ピンの修正用）。
 */
export async function geocodeOneStopInBrowser(
  stop: TravelStop,
  options?: { destinationHint?: string },
): Promise<TravelStop | null> {
  const hit = await resolveStopHit(stop, options?.destinationHint);
  if (!hit) return null;
  return {
    ...stop,
    lat: hit.lat,
    lon: hit.lon,
    address: stop.address || hit.displayName,
  };
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
  const maxCount = options?.maxCount ?? 24;
  const need = stops.filter((s) => s.lat == null || s.lon == null);
  const targets = need.slice(0, maxCount);
  const byId = new Map(stops.map((s) => [s.id, { ...s }]));
  let updated = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const stop = targets[i]!;
    options?.onProgress?.(i + 1, targets.length, stop.name);
    const next = await geocodeOneStopInBrowser(stop, {
      destinationHint: options?.destinationHint,
    });
    if (next) {
      byId.set(stop.id, next);
      updated += 1;
    }
    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  return {
    stops: stops.map((s) => byId.get(s.id) ?? s),
    updated,
  };
}
