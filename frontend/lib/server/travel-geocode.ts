/**
 * 地名 → 座標。Nominatim は Azure SWA から弾かれやすいので
 * 住所付き候補 → Photon（複数候補を住所で選別）→ ローカル → Open-Meteo → Nominatim。
 */
import { sanitizeText } from "@/lib/server/security";
import {
  buildGeocodeCandidates,
  extractAddressHints,
  pickBestPhotonFeature,
  resolveLocalTravelPlace,
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
  addressHints: string[] = [],
): Promise<GeocodeHit | null> {
  const url = `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(query)}`;
  const data = (await fetchJson(url)) as {
    features?: PhotonFeatureLike[];
  } | null;
  const feat = pickBestPhotonFeature(data?.features, addressHints);
  const coords = feat?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = feat?.properties;
  const displayName = [p?.name, p?.city, p?.state, p?.country]
    .filter(Boolean)
    .join(", ");
  return { lat, lon, displayName: displayName || undefined, source: "photon" };
}

async function geocodeOpenMeteo(query: string): Promise<GeocodeHit | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=1&language=ja&format=json`;
  const data = (await fetchJson(url)) as {
    results?: Array<{
      latitude?: number;
      longitude?: number;
      name?: string;
      admin1?: string;
      country?: string;
    }>;
  } | null;
  const hit = data?.results?.[0];
  if (hit?.latitude == null || hit?.longitude == null) return null;
  const displayName = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return {
    lat: Number(hit.latitude),
    lon: Number(hit.longitude),
    displayName: displayName || undefined,
    source: "open-meteo",
  };
}

async function geocodeNominatim(query: string): Promise<GeocodeHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const data = (await fetchJson(url, {
    headers: {
      "User-Agent": "AquaTravelApp/1.0 (personal; contact=aquacore.net)",
    },
    timeoutMs: 4_000,
  })) as Array<{ lat?: string; lon?: string; display_name?: string }> | null;
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit?.lat || !hit?.lon) return null;
  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    displayName: hit.display_name,
    source: "nominatim",
  };
}

/** 複数クエリ候補を順に試す（行程文 → 切り出した地名） */
export async function geocodePlace(
  query: string,
  options?: { timeoutMs?: number; destinationHint?: string; address?: string },
): Promise<GeocodeHit | null> {
  void options?.timeoutMs;
  const base = cleanQuery(query);
  if (!base) return null;

  const address = options?.address;
  const hints = extractAddressHints(address);
  const candidates = buildGeocodeCandidates(
    { name: base, address },
    options?.destinationHint,
  );
  if (!candidates.includes(base)) candidates.unshift(base);

  // 住所があるときは API を先に（誤ったローカル一致を避ける）
  if (address) {
    for (const q of candidates) {
      const photon = await geocodePhoton(q, hints);
      if (photon) return photon;
      const om = await geocodeOpenMeteo(q);
      if (om) return om;
      const nom = await geocodeNominatim(q);
      if (nom) return nom;
    }
  }

  for (const q of candidates) {
    const local = resolveLocalTravelPlace(q);
    if (local) {
      return {
        lat: local.lat,
        lon: local.lon,
        displayName: local.label,
        source: "local",
      };
    }
    const photon = await geocodePhoton(q, hints);
    if (photon) return photon;
    const om = await geocodeOpenMeteo(q);
    if (om) return om;
    const nom = await geocodeNominatim(q);
    if (nom) return nom;
  }
  return null;
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
  const hints = extractAddressHints(stop.address);
  const candidates = buildGeocodeCandidates(stop, destinationHint);
  const blob = [stop.name, stop.address, stop.note, stop.sourceSnippet]
    .filter(Boolean)
    .join(" ");

  if (stop.address) {
    for (const q of candidates) {
      const photon = await geocodePhoton(q, hints);
      if (photon) return photon;
      const om = await geocodeOpenMeteo(q);
      if (om) return om;
      const nom = await geocodeNominatim(q);
      if (nom) return nom;
    }
  }

  const local = resolveLocalTravelPlace(blob);
  if (local) {
    return {
      lat: local.lat,
      lon: local.lon,
      displayName: local.label,
      source: "local",
    };
  }

  for (const q of candidates) {
    const photon = await geocodePhoton(q, hints);
    if (photon) return photon;
    const om = await geocodeOpenMeteo(q);
    if (om) return om;
    const nom = await geocodeNominatim(q);
    if (nom) return nom;
  }
  return null;
}
