/**
 * 地名 → 座標。
 * ローカル辞書優先 → 行き先領域拘束の Photon → Open-Meteo → Nominatim。
 */
import { sanitizeText } from "@/lib/server/security";
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

export type GeocodeHit = {
  lat: number;
  lon: number;
  displayName?: string;
  source: "local" | "photon" | "open-meteo" | "nominatim";
};

function cleanQuery(query: string): string {
  return sanitizeText(
    query
      .replace(/\d{1,2}:\d{2}/g, " ")
      .replace(/【[^】]*】/g, " ")
      .replace(/[◆●・■□]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    160,
  );
}

async function fetchJson(
  url: string,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 4_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(options?.headers ?? {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodePhoton(
  query: string,
  options?: { addressHints?: string[]; region?: GeoRegionBias | null },
): Promise<GeocodeHit | null> {
  const region = options?.region ?? null;
  const params = new URLSearchParams({ limit: "8", q: query });
  if (region) {
    params.set("lat", String(region.lat));
    params.set("lon", String(region.lon));
  }
  const data = (await fetchJson(
    `https://photon.komoot.io/api/?${params.toString()}`,
  )) as { features?: PhotonFeatureLike[] } | null;
  const feat = pickBestPhotonFeature(data?.features, {
    addressHints: options?.addressHints,
    region,
  });
  const coords = feat?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!isCoordInRegion(lat, lon, region)) return null;
  const p = feat?.properties;
  const displayName = [p?.name, p?.city, p?.state, p?.country]
    .filter(Boolean)
    .join(", ");
  return { lat, lon, displayName: displayName || undefined, source: "photon" };
}

async function geocodeOpenMeteo(
  query: string,
  region?: GeoRegionBias | null,
): Promise<GeocodeHit | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=5&language=ja&format=json`;
  const data = (await fetchJson(url)) as {
    results?: Array<{
      latitude?: number;
      longitude?: number;
      name?: string;
      admin1?: string;
      country?: string;
      country_code?: string;
    }>;
  } | null;
  for (const hit of data?.results ?? []) {
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
      source: "open-meteo",
    };
  }
  return null;
}

async function geocodeNominatim(
  query: string,
  region?: GeoRegionBias | null,
): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    format: "json",
    limit: "5",
    q: query,
  });
  if (region?.id === "hokkaido" || region?.id === "japan") {
    params.set("countrycodes", "jp");
  }
  const data = (await fetchJson(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        "User-Agent": "AquaTravelApp/1.0 (personal; contact=aquacore.net)",
      },
      timeoutMs: 4_000,
    },
  )) as Array<{ lat?: string; lon?: string; display_name?: string }> | null;
  for (const hit of Array.isArray(data) ? data : []) {
    if (!hit?.lat || !hit?.lon) continue;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!isCoordInRegion(lat, lon, region ?? null)) continue;
    return {
      lat,
      lon,
      displayName: hit.display_name,
      source: "nominatim",
    };
  }
  return null;
}

/** 複数クエリ候補を順に試す */
export async function geocodePlace(
  query: string,
  options?: { timeoutMs?: number; destinationHint?: string; address?: string },
): Promise<GeocodeHit | null> {
  void options?.timeoutMs;
  const base = cleanQuery(query);
  if (!base) return null;
  return geocodeTravelStopFields(
    { name: base, address: options?.address },
    options?.destinationHint,
  );
}

/** ストップ単位で候補生成してジオコード */
export async function geocodeTravelStopFields(
  stop: {
    name: string;
    address?: string;
    note?: string;
    sourceSnippet?: string;
  },
  destinationHint?: string,
): Promise<GeocodeHit | null> {
  const safeAddress = sanitizeAddressForGeocode(stop.address, destinationHint);
  const region = inferRegionBias(destinationHint, safeAddress);

  const local = resolveLocalTravelPlaceForStop(stop.name, {
    destinationHint,
    note: stop.note,
    sourceSnippet: stop.sourceSnippet,
  });
  if (local) {
    return {
      lat: local.lat,
      lon: local.lon,
      displayName: local.label,
      source: "local",
    };
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
    const photon = await geocodePhoton(q, { addressHints: hints, region });
    if (photon) return photon;
    const om = await geocodeOpenMeteo(q, region);
    if (om) return om;
    const nom = await geocodeNominatim(q, region);
    if (nom) return nom;
  }
  return null;
}
