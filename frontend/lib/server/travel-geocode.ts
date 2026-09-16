/**
 * 地名 → 座標。Nominatim は Azure SWA から弾かれやすいので
 * Photon → Open-Meteo → Nominatim の順で試す。
 */
import { sanitizeText } from "@/lib/server/security";

export type GeocodeHit = {
  lat: number;
  lon: number;
  displayName?: string;
  source: "photon" | "open-meteo" | "nominatim";
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

async function geocodePhoton(query: string): Promise<GeocodeHit | null> {
  const url =
    `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`;
  const data = (await fetchJson(url)) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: { name?: string; city?: string; state?: string; country?: string };
    }>;
  } | null;
  const feat = data?.features?.[0];
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

/** 複数クエリ候補を順に試す（例: 「清水寺」→「京都 清水寺」） */
export async function geocodePlace(
  query: string,
  options?: { timeoutMs?: number },
): Promise<GeocodeHit | null> {
  void options;
  const base = cleanQuery(query);
  if (!base) return null;

  const candidates = [base];
  // 長すぎるクエリを短縮（先頭の地名らしき部分）
  if (base.length > 40) {
    candidates.push(base.slice(0, 40));
  }

  for (const q of candidates) {
    const photon = await geocodePhoton(q);
    if (photon) return photon;
    const om = await geocodeOpenMeteo(q);
    if (om) return om;
    const nom = await geocodeNominatim(q);
    if (nom) return nom;
  }
  return null;
}
