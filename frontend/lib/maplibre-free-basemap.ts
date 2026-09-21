/**
 * MapLibre 無料ラスタ（キー不要）。
 *
 * 再発クラス: Carto Voyager は HTTP 200 + image/png でも
 * 「API KEY REQUIRED」透かしを返す → probe 成功＝地図が見える、ではない。
 * 不変条件: 素人に道路・海岸線が分かるタイル。透かしは失敗。
 */

export type FreeBasemapCandidate = {
  id: string;
  label: string;
  tiles: string[];
  attribution: string;
  /** probe 用（ズーム2の実タイル） */
  sampleUrl: string;
};

/** キー不要・ブラウザ UA で到達確認済みの順 */
export const FREE_BASEMAP_CANDIDATES: FreeBasemapCandidate[] = [
  {
    id: "osm-de",
    label: "OpenStreetMap DE",
    tiles: ["https://tile.openstreetmap.de/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
    sampleUrl: "https://tile.openstreetmap.de/2/1/1.png",
  },
  {
    id: "osm-fr-hot",
    label: "OpenStreetMap FR HOT",
    tiles: [
      "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      "https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    ],
    attribution: "© OpenStreetMap contributors · HOT",
    sampleUrl: "https://a.tile.openstreetmap.fr/hot/2/1/1.png",
  },
  {
    id: "esri-street",
    label: "Esri World Street Map",
    // ArcGIS tile は {z}/{y}/{x}
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "© Esri",
    sampleUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/2/1/1",
  },
  {
    id: "opentopo",
    label: "OpenTopoMap",
    tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors · © OpenTopoMap",
    sampleUrl: "https://tile.opentopomap.org/2/1/1.png",
  },
];

export function rasterBasemapStyle(tiles: string[], attribution: string) {
  return {
    version: 8 as const,
    sources: {
      basemap: {
        type: "raster" as const,
        tiles,
        tileSize: 256,
        attribution,
        maxzoom: 18,
      },
    },
    layers: [{ id: "basemap", type: "raster" as const, source: "basemap" }],
  };
}

export type PickedBasemapStyle = {
  style: ReturnType<typeof rasterBasemapStyle>;
  label: string;
  id: string;
};

/**
 * cartocdn は API キー無しだと透かし PNG（image/* 200）を返す。
 * キー無し URL は常に失敗扱い（reachable ≠ usable）。
 */
export function isUnauthenticatedCartoBasemapUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes("cartocdn.com") && !host.includes("carto.com")) {
      return false;
    }
    if (u.searchParams.has("api_key") || u.searchParams.has("apikey")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

type ProbeFn = (url: string) => Promise<boolean>;

/** probe 成功した最初の無料ベースマップを MapLibre style として返す */
export async function pickWorkingFreeBasemap(
  probe: ProbeFn,
): Promise<PickedBasemapStyle> {
  for (const candidate of FREE_BASEMAP_CANDIDATES) {
    if (await probe(candidate.sampleUrl)) {
      return {
        style: rasterBasemapStyle(candidate.tiles, candidate.attribution),
        label: candidate.label,
        id: candidate.id,
      };
    }
  }
  throw new Error(
    "無料地図タイル（OSM DE / OSM FR / Esri / OpenTopo）に到達できません",
  );
}
