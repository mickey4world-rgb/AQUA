import { inferSatelliteCountry } from "@/lib/eagle-eye-country";
import type { EagleEyeSatelliteDef } from "@/lib/eagle-eye-data";
import { EAGLE_EYE_SATELLITES } from "@/lib/eagle-eye-data";

const CELESTRAK_GROUPS = [
  "stations",
  "weather",
  "visual",
  "resource",
  "science",
  "gps-ops",
  "galileo",
] as const;

const MAX_SATELLITES = 40;
const CACHE_TTL_MS = 60 * 60 * 1000;

const CATEGORY_IMAGES: Record<string, string> = {
  stations:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tokyo_from_space.jpg/640px-Tokyo_from_space.jpg",
  weather:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg/640px-View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg",
  resource:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Tokyo_Skyline_2021.jpg/640px-Tokyo_Skyline_2021.jpg",
  visual:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/ISS-36_Over_Europe.jpg/640px-ISS-36_Over_Europe.jpg",
  default:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/640px-The_Earth_seen_from_Apollo_17.jpg",
};

const NORAD_ENRICH: Record<
  number,
  Partial<Pick<EagleEyeSatelliteDef, "info" | "mediaUrl" | "mediaType" | "footprint" | "liveStreamUrl">>
> = {
  25544: {
    info: "国際宇宙ステーション。約90分周期で地球を周回。NASA 公開の地球ライブ映像をリアルタイム配信中。",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tokyo_from_space.jpg/640px-Tokyo_from_space.jpg",
    mediaType: "video",
    liveStreamUrl: "https://www.youtube.com/embed/iYmvCUonukw?autoplay=1&mute=1&rel=0",
  },
  33591: {
    info: "NOAA-19 気象衛星。極軌道で全球の気象・雲画像を取得します。",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg/640px-View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg",
    mediaType: "image",
  },
  39084: {
    info: "LANDSAT 8 地球観測衛星。地表の高解像度マルチスペクトル画像を提供します。",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Tokyo_Skyline_2021.jpg/640px-Tokyo_Skyline_2021.jpg",
    mediaType: "image",
  },
};

type ParsedTle = {
  name: string;
  noradId: number;
  tle1: string;
  tle2: string;
  category: string;
};

let cache: { satellites: EagleEyeSatelliteDef[]; fetchedAt: number } | null = null;

function slugify(name: string, noradId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return base ? `${base}-${noradId}` : `sat-${noradId}`;
}

function parseTleBlock(text: string, category: string): ParsedTle[] {
  const lines = text.trim().split(/\r?\n/);
  const results: ParsedTle[] = [];

  for (let i = 0; i + 2 < lines.length; ) {
    const name = lines[i].trim();
    const tle1 = lines[i + 1]?.trim();
    const tle2 = lines[i + 2]?.trim();
    if (!name || !tle1?.startsWith("1 ") || !tle2?.startsWith("2 ")) {
      i += 1;
      continue;
    }
    const noradMatch = /^1 (\d+)/.exec(tle1);
    const noradId = noradMatch ? Number(noradMatch[1]) : 0;
    if (noradId) {
      results.push({ name, noradId, tle1, tle2, category });
    }
    i += 3;
  }
  return results;
}

async function fetchGroup(category: string): Promise<ParsedTle[]> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${category}&FORMAT=tle`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  return parseTleBlock(await res.text(), category);
}

function buildSatellite(parsed: ParsedTle): EagleEyeSatelliteDef {
  const enrich = NORAD_ENRICH[parsed.noradId];
  const imageUrl =
    enrich?.mediaUrl ?? CATEGORY_IMAGES[parsed.category] ?? CATEGORY_IMAGES.default;
  const countryInfo = inferSatelliteCountry(parsed.name, parsed.category);

  return {
    id: slugify(parsed.name, parsed.noradId),
    name: parsed.name,
    noradId: parsed.noradId,
    category: parsed.category,
    country: countryInfo.country,
    countryCode: countryInfo.countryCode,
    tle1: parsed.tle1,
    tle2: parsed.tle2,
    info:
      enrich?.info ??
      `${parsed.name}（${countryInfo.country} / ${parsed.category}）。TLE軌道データからリアルタイム位置を表示しています。`,
    mediaUrl: imageUrl,
    mediaType: enrich?.mediaType ?? "image",
    liveStreamUrl: enrich?.liveStreamUrl,
    footprint: enrich?.footprint,
  };
}

export async function getEagleEyeSatelliteCatalog(): Promise<EagleEyeSatelliteDef[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.satellites;
  }

  try {
    const groups = await Promise.all(CELESTRAK_GROUPS.map((g) => fetchGroup(g)));
    const seen = new Set<number>();
    const merged: ParsedTle[] = [];

    for (const list of groups) {
      for (const item of list) {
        if (seen.has(item.noradId)) continue;
        seen.add(item.noradId);
        merged.push(item);
        if (merged.length >= MAX_SATELLITES) break;
      }
      if (merged.length >= MAX_SATELLITES) break;
    }

    const staticNorads = new Set(EAGLE_EYE_SATELLITES.map((s) => s.noradId).filter(Boolean));
    const fetched = merged
      .filter((m) => !staticNorads.has(m.noradId))
      .map(buildSatellite);

    const satellites = [...EAGLE_EYE_SATELLITES, ...fetched].slice(0, MAX_SATELLITES);
    cache = { satellites, fetchedAt: Date.now() };
    return satellites;
  } catch {
    cache = { satellites: EAGLE_EYE_SATELLITES, fetchedAt: Date.now() };
    return EAGLE_EYE_SATELLITES;
  }
}
