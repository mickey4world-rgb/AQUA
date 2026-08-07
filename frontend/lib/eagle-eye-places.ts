/** 地名 → 座標（外部 API 不要・低コスト） */

export interface GeoPlace {
  lat: number;
  lon: number;
  label: string;
}

type PlaceEntry = GeoPlace & { keys: string[] };

const PLACES: PlaceEntry[] = [
  { label: "東京", lat: 35.6812, lon: 139.7671, keys: ["東京", "tokyo", "とうきょう"] },
  { label: "渋谷", lat: 35.6595, lon: 139.7004, keys: ["渋谷", "shibuya", "しぶや"] },
  { label: "新宿", lat: 35.6938, lon: 139.7034, keys: ["新宿", "shinjuku"] },
  { label: "横浜", lat: 35.4437, lon: 139.638, keys: ["横浜", "yokohama"] },
  { label: "大阪", lat: 34.6937, lon: 135.5023, keys: ["大阪", "osaka", "おおさか"] },
  { label: "京都", lat: 35.0116, lon: 135.7681, keys: ["京都", "kyoto"] },
  { label: "名古屋", lat: 35.1815, lon: 136.9066, keys: ["名古屋", "nagoya"] },
  { label: "福岡", lat: 33.5904, lon: 130.4017, keys: ["福岡", "fukuoka"] },
  { label: "札幌", lat: 43.0618, lon: 141.3545, keys: ["札幌", "sapporo"] },
  { label: "仙台", lat: 38.2682, lon: 140.8694, keys: ["仙台", "sendai"] },
  { label: "広島", lat: 34.3853, lon: 132.4553, keys: ["広島", "hiroshima"] },
  { label: "那覇", lat: 26.2124, lon: 127.6809, keys: ["那覇", "naha", "沖縄", "okinawa"] },
  { label: "千葉", lat: 35.6074, lon: 140.1065, keys: ["千葉", "chiba"] },
  { label: "埼玉", lat: 35.8617, lon: 139.6455, keys: ["埼玉", "saitama"] },
  { label: "神戸", lat: 34.6901, lon: 135.1955, keys: ["神戸", "kobe"] },
  { label: "秋葉原", lat: 35.6984, lon: 139.7731, keys: ["秋葉原", "akihabara"] },
  { label: "羽田", lat: 35.5494, lon: 139.7798, keys: ["羽田", "haneda"] },
  { label: "成田", lat: 35.772, lon: 140.3929, keys: ["成田", "narita"] },
  { label: "富士山", lat: 35.3606, lon: 138.7274, keys: ["富士山", "富士", "fuji"] },
  { label: "ディズニーリゾート", lat: 35.6329, lon: 139.8804, keys: ["ディズニー", "disney", "tdr", "舞浜"] },
  { label: "ニューヨーク", lat: 40.7128, lon: -74.006, keys: ["ニューヨーク", "new york", "nyc"] },
  { label: "ロンドン", lat: 51.5074, lon: -0.1278, keys: ["ロンドン", "london"] },
  { label: "パリ", lat: 48.8566, lon: 2.3522, keys: ["パリ", "paris"] },
  { label: "シンガポール", lat: 1.3521, lon: 103.8198, keys: ["シンガポール", "singapore"] },
  { label: "ソウル", lat: 37.5665, lon: 126.978, keys: ["ソウル", "seoul", "韓国"] },
  { label: "北京", lat: 39.9042, lon: 116.4074, keys: ["北京", "beijing", "ぺきん"] },
  { label: "上海", lat: 31.2304, lon: 121.4737, keys: ["上海", "shanghai"] },
  { label: "シドニー", lat: -33.8688, lon: 151.2093, keys: ["シドニー", "sydney"] },
];

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, "");
}

/** 地名文字列から座標を解決（部分一致） */
export function resolvePlaceQuery(query: string): GeoPlace | null {
  const q = normalizeQuery(query);
  if (!q) return null;

  const latLonMatch = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/.exec(query.trim());
  if (latLonMatch) {
    const lat = Number(latLonMatch[1]);
    const lon = Number(latLonMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, label: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°` };
    }
  }

  for (const place of PLACES) {
    if (place.keys.some((k) => normalizeQuery(k) === q || q.includes(normalizeQuery(k)))) {
      return { lat: place.lat, lon: place.lon, label: place.label };
    }
  }

  return null;
}

export const DEFAULT_SORT_PLACE: GeoPlace = {
  lat: 35.6812,
  lon: 139.7671,
  label: "東京",
};
