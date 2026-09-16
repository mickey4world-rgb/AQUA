/**
 * ブラウザから直接ジオコード。
 * ローカル辞書優先 → 行き先領域で Photon を拘束（北海道なのに豊橋・中国へ飛ばない）。
 */
import type { TravelStop } from "@/lib/types/travel";
import {
  buildGeocodeCandidates,
  extractAddressHints,
  inferRegionBias,
  isCoordInRegion,
  pickBestPhotonFeature,
  resolveLocalTravelPlaceForStop,
  sanitizeAddressForGeocode,
  type GeoRegionBias,
  type PhotonFeatureLike,
} from "@/lib/travel-geocode-query";

export type ClientGeocodeHit = {
  lat: number;
  lon: number;
  displayName?: string;
};

async function photon(
  query: string,
  options?: { addressHints?: string[]; region?: GeoRegionBias | null },
): Promise<ClientGeocodeHit | null> {
  const region = options?.region ?? null;
  const params = new URLSearchParams({
    limit: "8",
    q: query,
  });
  if (region) {
    params.set("lat", String(region.lat));
    params.set("lon", String(region.lon));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: PhotonFeatureLike[] };
  const feat = pickBestPhotonFeature(data.features, {
    addressHints: options?.addressHints,
    region,
  });
  const coords = feat?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!isCoordInRegion(lat, lon, region ?? null)) return null;
  const p = feat?.properties;
  return {
    lat,
    lon,
    displayName: [p?.name, p?.city, p?.state, p?.country].filter(Boolean).join(", "),
  };
}

async function openMeteo(
  query: string,
  region?: GeoRegionBias | null,
): Promise<ClientGeocodeHit | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=5&language=ja&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: Array<{
      latitude?: number;
      longitude?: number;
      name?: string;
      admin1?: string;
      country?: string;
      country_code?: string;
    }>;
  };
  const results = data.results ?? [];
  for (const hit of results) {
    if (hit.latitude == null || hit.longitude == null) continue;
    const lat = Number(hit.latitude);
    const lon = Number(hit.longitude);
    if (!isCoordInRegion(lat, lon, region ?? null)) continue;
    if (region && hit.country_code && hit.country_code.toUpperCase() !== "JP") {
      continue;
    }
    return {
      lat,
      lon,
      displayName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
    };
  }
  return null;
}

async function resolveStopHit(
  stop: TravelStop,
  destinationHint?: string,
): Promise<ClientGeocodeHit | null> {
  const safeAddress = sanitizeAddressForGeocode(stop.address, destinationHint);
  const region = inferRegionBias(destinationHint, safeAddress);

  // 1) ローカル辞書を最優先（ニュー阿寒ホテル → 豊橋問題の本丸）
  const local = resolveLocalTravelPlaceForStop(stop.name, {
    destinationHint,
    note: stop.note,
    sourceSnippet: stop.sourceSnippet,
  });
  if (local) {
    return { lat: local.lat, lon: local.lon, displayName: local.label };
  }

  const candidates = buildGeocodeCandidates(
    {
      name: stop.name,
      address: safeAddress,
      note: stop.note,
      sourceSnippet: stop.sourceSnippet,
    },
    destinationHint,
  );
  const hints = extractAddressHints(safeAddress);

  for (const q of candidates) {
    try {
      const hit =
        (await photon(q, { addressHints: hints, region })) ||
        (await openMeteo(q, region));
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
 * 1地点だけ座標を付け直す（既存の誤ピン修正用）。
 * 汚染された住所（他県・国外）は無視して行き先で拘束する。
 */
export async function geocodeOneStopInBrowser(
  stop: TravelStop,
  options?: { destinationHint?: string },
): Promise<TravelStop | null> {
  const hit = await resolveStopHit(stop, options?.destinationHint);
  if (!hit) return null;
  const safeAddress = sanitizeAddressForGeocode(
    stop.address,
    options?.destinationHint,
  );
  return {
    ...stop,
    lat: hit.lat,
    lon: hit.lon,
    // 汚染住所は消して正しい表示名へ
    address: safeAddress || hit.displayName || stop.address,
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
