/**
 * 旅行行程テキストからジオコード用クエリ候補を作る。
 * 行き先から領域を推論し、誤った都道府県・国外ヒットを捨てる。
 */

import {
  inferRegionFromDestinationText,
  type GeoRegionBias,
} from "@/lib/travel-geocode-regions";

export type { GeoRegionBias } from "@/lib/travel-geocode-regions";
export { HOKKAIDO_REGION, JAPAN_REGION } from "@/lib/travel-geocode-regions";

export type LocalTravelPlace = {
  lat: number;
  lon: number;
  label: string;
  keys: string[];
};

export type PhotonFeatureLike = {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    city?: string;
    state?: string;
    county?: string;
    country?: string;
    countrycode?: string;
    osm_value?: string;
    osm_key?: string;
  };
};

/** 主要観光地 — API 不通・誤爆時の砦（行き先領域内のものだけ採用） */
const LOCAL_PLACES: LocalTravelPlace[] = [
  { label: "新千歳空港", lat: 42.7752, lon: 141.6925, keys: ["新千歳空港", "新千歳", "cts"] },
  { label: "札幌駅", lat: 43.0686, lon: 141.3508, keys: ["札幌駅"] },
  { label: "札幌時計台", lat: 43.0629, lon: 141.3534, keys: ["時計台", "札幌時計台"] },
  { label: "大通公園", lat: 43.0595, lon: 141.347, keys: ["大通公園", "大通り公園"] },
  { label: "すすきの", lat: 43.0555, lon: 141.353, keys: ["すすきの"] },
  { label: "定山渓", lat: 42.977, lon: 141.1589, keys: ["定山渓", "定山渓温泉"] },
  { label: "札幌", lat: 43.0618, lon: 141.3545, keys: ["札幌", "sapporo"] },
  { label: "小樽運河", lat: 43.1988, lon: 141.0022, keys: ["小樽運河"] },
  { label: "小樽", lat: 43.1907, lon: 140.9947, keys: ["小樽", "otaru"] },
  { label: "旭川", lat: 43.7706, lon: 142.3649, keys: ["旭川", "asahikawa"] },
  { label: "層雲峡", lat: 43.7279, lon: 142.9513, keys: ["層雲峡"] },
  { label: "富良野", lat: 43.3469, lon: 142.3917, keys: ["富良野", "furano"] },
  { label: "美瑛青い池", lat: 43.494, lon: 142.6135, keys: ["青い池"] },
  { label: "美瑛", lat: 43.588, lon: 142.467, keys: ["美瑛", "biei"] },
  { label: "白金温泉", lat: 43.486, lon: 142.594, keys: ["白金温泉"] },
  { label: "洞爺湖", lat: 42.578, lon: 140.855, keys: ["洞爺湖", "洞爺"] },
  { label: "登別", lat: 42.4937, lon: 141.151, keys: ["登別", "登別温泉"] },
  { label: "支笏湖", lat: 42.772, lon: 141.315, keys: ["支笏湖"] },
  { label: "函館山", lat: 41.759, lon: 140.704, keys: ["函館山"] },
  { label: "五稜郭", lat: 41.7969, lon: 140.7566, keys: ["五稜郭"] },
  { label: "函館", lat: 41.7687, lon: 140.7289, keys: ["函館", "hakodate"] },
  { label: "知床五湖", lat: 44.122, lon: 145.085, keys: ["知床五湖"] },
  { label: "ウトロ", lat: 44.072, lon: 144.992, keys: ["ウトロ", "うつろ"] },
  { label: "知床", lat: 44.07, lon: 145.12, keys: ["知床", "shiretoko"] },
  {
    label: "風蓮湖",
    lat: 43.3101,
    lon: 145.3399,
    keys: ["風蓮湖", "風連湖", "ふれんこ", "furenko"],
  },
  { label: "別海町", lat: 43.3941, lon: 145.1171, keys: ["別海町", "別海"] },
  { label: "野付半島", lat: 43.6, lon: 145.32, keys: ["野付半島"] },
  { label: "釧路", lat: 42.9849, lon: 144.382, keys: ["釧路", "kushiro"] },
  // ホテル名が豊橋の同名施設に誤爆するため先に辞書
  {
    label: "ニュー阿寒ホテル",
    lat: 43.4245,
    lon: 144.0945,
    keys: ["ニュー阿寒ホテル", "new akan", "ｎｅｗ阿寒"],
  },
  { label: "阿寒湖", lat: 43.436, lon: 144.094, keys: ["阿寒湖", "阿寒温泉", "阿寒"] },
  { label: "摩周湖", lat: 43.588, lon: 144.525, keys: ["摩周湖"] },
  { label: "屈斜路湖", lat: 43.57, lon: 144.34, keys: ["屈斜路", "屈斜路湖"] },
  { label: "網走", lat: 44.0206, lon: 144.2734, keys: ["網走"] },
  { label: "帯広", lat: 42.9236, lon: 143.196, keys: ["帯広"] },
  { label: "稚内", lat: 45.4156, lon: 141.673, keys: ["稚内"] },
  { label: "苫小牧", lat: 42.636, lon: 141.603, keys: ["苫小牧"] },
  { label: "室蘭", lat: 42.3152, lon: 140.9738, keys: ["室蘭"] },
  { label: "千歳", lat: 42.821, lon: 141.651, keys: ["千歳"] },
  { label: "東京", lat: 35.6812, lon: 139.7671, keys: ["東京", "tokyo"] },
  { label: "羽田空港", lat: 35.5494, lon: 139.7798, keys: ["羽田空港", "羽田"] },
  { label: "成田空港", lat: 35.772, lon: 140.3929, keys: ["成田空港", "成田"] },
  { label: "大阪", lat: 34.6937, lon: 135.5023, keys: ["大阪", "osaka"] },
  { label: "京都", lat: 35.0116, lon: 135.7681, keys: ["京都", "kyoto"] },
];

const PLACE_SUFFIX_RE =
  /[一-龥ぁ-んァ-ヶーA-Za-z0-9]{2,24}(?:駅|空港|温泉|神社|寺院|寺|城|公園|湖|岳|山|橋|港|市場|博物館|美術館|塔|台|通り|通|運河|峠|峡|浜|海岸|展望台|牧場|動物園|水族館|ホテル)/g;

const MOVE_TO_RE =
  /([一-龥ぁ-んァ-ヶー]{2,16})(?:へ|に)(?:移動|到着|向か|出発|向かう|向かいます)/g;

const ADDR_UNIT_RE =
  /(?:北海道|東京都|(?:大阪|京都)府|(?:..?)県)?([一-龥ぁ-んァ-ヶー]{2,12}(?:郡))?([一-龥ぁ-んァ-ヶー]{2,12}(?:市|区|町|村))/g;

const NON_PLACE_WORDS = new Set([
  "専用",
  "移動",
  "到着",
  "出発",
  "見学",
  "散策",
  "観光",
  "訪問",
  "昼食",
  "夕食",
  "朝食",
  "食事",
  "ランチ",
  "ディナー",
  "集合",
  "解散",
  "自由",
  "行動",
  "各自",
  "送迎",
  "貸切",
  "ホテル",
  "チェックイン",
  "チェックアウト",
  "約分",
  "分後",
  "バス",
  "電車",
  "列車",
  "空港",
  "温泉",
]);

const NOISE_RE =
  /\d{1,2}[:：]\d{2}|【[^】]*】|（[^）]*）|\([^)]*\)|約\d+\s*分|各自|集合|解散|自由行動|昼食|夕食|朝食|ランチ|ディナー|食事|海鮮丼|チェックイン|チェックアウト|専用(?:バス|車)|貸切バス|観光バス|送迎|にて|へ移動|到着後|出発|見学|散策|観光|訪問|到着|出発後|移動/g;

function normalizeHaystack(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function inferRegionBias(
  destinationHint?: string,
  address?: string,
): GeoRegionBias | null {
  const localFromDest = destinationHint
    ? matchLongestPlace(destinationHint)
    : null;
  return inferRegionFromDestinationText(
    destinationHint,
    address,
    localFromDest
      ? { lat: localFromDest.lat, lon: localFromDest.lon, label: localFromDest.label }
      : null,
  );
}

export function isCoordInRegion(
  lat: number,
  lon: number,
  region: GeoRegionBias | null,
): boolean {
  if (!region) return true;
  const [minLon, minLat, maxLon, maxLat] = region.bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

/** 誤ピン由来の住所（他県・国外）は行き先と矛盾するので捨てる */
export function sanitizeAddressForGeocode(
  address: string | undefined,
  destinationHint?: string,
): string | undefined {
  if (!address?.trim()) return undefined;
  const region = inferRegionBias(destinationHint, undefined);
  if (!region) return address.trim();
  const hay = normalizeHaystack(address);
  if (region.rejectPrefTokens.some((t) => hay.includes(normalizeHaystack(t)))) {
    return undefined;
  }
  // 行き先領域の stateTokens が住所にも行き先にも無いのに他県っぽい → 汚染
  const hasRegionToken = region.stateTokens.some((t) =>
    hay.includes(normalizeHaystack(t)),
  );
  const hasAnyPref = /北海道|東京都|大阪府|京都府|.+?[県]|愛知|豊橋|岩手/.test(
    address,
  );
  if (!hasRegionToken && hasAnyPref && region.id !== "japan") {
    return undefined;
  }
  return address.trim();
}

/** 行程文に含まれる既知地名を最長一致で拾う */
export function resolveLocalTravelPlace(text: string): LocalTravelPlace | null {
  const src = text.normalize("NFKC");
  for (const m of src.matchAll(MOVE_TO_RE)) {
    const dest = matchLongestPlace(m[1] || "");
    if (dest) return dest;
  }
  return matchLongestPlace(src);
}

function matchLongestPlace(text: string): LocalTravelPlace | null {
  const hay = normalizeHaystack(text);
  if (!hay) return null;
  let best: { place: LocalTravelPlace; keyLen: number } | null = null;
  for (const place of LOCAL_PLACES) {
    for (const key of place.keys) {
      const k = normalizeHaystack(key);
      if (!k || k.length < 2) continue;
      if (hay.includes(k) && (!best || k.length > best.keyLen)) {
        best = { place, keyLen: k.length };
      }
    }
  }
  return best?.place ?? null;
}

/**
 * 名前側だけでローカル解決（汚染住所を混ぜない）。
 * 行き先領域がある場合、辞書座標がその領域内のものだけ採用。
 */
export function resolveLocalTravelPlaceForStop(
  name: string,
  options?: { destinationHint?: string; note?: string; sourceSnippet?: string },
): LocalTravelPlace | null {
  const blob = [name, options?.note, options?.sourceSnippet].filter(Boolean).join(" ");
  const hit = resolveLocalTravelPlace(blob);
  if (!hit) return null;
  const region = inferRegionBias(options?.destinationHint);
  if (region && !isCoordInRegion(hit.lat, hit.lon, region)) return null;
  return hit;
}

function pushUnique(out: string[], value: string | undefined) {
  const v = (value || "").replace(/\s+/g, " ").trim();
  if (!v || v.length < 2) return;
  if (NON_PLACE_WORDS.has(v)) return;
  if (out.some((x) => x === v)) return;
  out.push(v.slice(0, 80));
}

function stripNoise(text: string): string {
  return text
    .replace(NOISE_RE, " ")
    .replace(/[◆●・■□\-–—]/g, " ")
    .replace(/[、。．，,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPlaceTokens(text: string): string[] {
  const tokens: string[] = [];
  const src = text.normalize("NFKC");
  for (const m of src.matchAll(PLACE_SUFFIX_RE)) {
    pushUnique(tokens, m[0]);
  }
  for (const m of src.matchAll(MOVE_TO_RE)) {
    pushUnique(tokens, m[1]);
  }
  return tokens;
}

export function extractAddressHints(address: string | undefined): string[] {
  if (!address) return [];
  const src = address.normalize("NFKC");
  const hints: string[] = [];
  for (const m of src.matchAll(ADDR_UNIT_RE)) {
    if (m[1]) pushUnique(hints, m[1].replace(/郡$/, ""));
    if (m[1]) pushUnique(hints, m[1]);
    if (m[2]) {
      pushUnique(hints, m[2]);
      pushUnique(hints, m[2].replace(/(?:市|区|町|村)$/, ""));
    }
  }
  const pref = /北海道|東京都|大阪府|京都府|.+?[県]/.exec(src);
  if (pref) pushUnique(hints, pref[0]);
  return hints;
}

function featureBlob(feat: PhotonFeatureLike): string {
  const p = feat.properties;
  return normalizeHaystack(
    [
      p?.name,
      p?.city,
      p?.county,
      p?.state,
      p?.country,
      p?.countrycode,
      p?.osm_value,
      p?.osm_key,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function featureCoords(
  feat: PhotonFeatureLike,
): { lat: number; lon: number } | null {
  const coords = feat.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/**
 * Photon 候補を行き先領域・住所ヒントで選別。
 * 領域外は捨てる（先頭結果の誤爆を防ぐ）。
 */
export function pickBestPhotonFeature(
  features: PhotonFeatureLike[] | undefined,
  options?: {
    addressHints?: string[];
    region?: GeoRegionBias | null;
  },
): PhotonFeatureLike | null {
  if (!features?.length) return null;
  const addressHints = options?.addressHints ?? [];
  const region = options?.region ?? null;

  const hintNorm = addressHints
    .map((h) => normalizeHaystack(h))
    .filter((h) => h.length >= 2);

  const scored: Array<{ feat: PhotonFeatureLike; score: number }> = [];
  for (const feat of features) {
    const xy = featureCoords(feat);
    if (!xy) continue;
    if (!isCoordInRegion(xy.lat, xy.lon, region)) continue;

    const blob = featureBlob(feat);
    if (region?.japanOnly) {
      const cc = (feat.properties?.countrycode || "").toLowerCase();
      if (cc && cc !== "jp") continue;
      if (/china|中国|韓国|korea|taiwan|台湾/.test(blob)) continue;
    }

    let score = 1;
    for (const h of hintNorm) {
      if (blob.includes(h)) score += h.length * 10;
    }
    if (region) {
      for (const t of region.stateTokens) {
        if (blob.includes(normalizeHaystack(t))) score += 20;
      }
    }
    if (/lagoon|lake|water|wetland|national_park|hotel|attraction/.test(blob)) {
      score += 3;
    }
    // レストラン単独ヒットは観光地より弱い
    if (/restaurant|cafe|fast_food/.test(blob)) score -= 5;
    scored.push({ feat, score });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.feat;
}

/**
 * Photon/Nominatim 向け候補。
 * 行き先付きの短い地名を優先し、汚染住所は使わない前提。
 */
export function buildGeocodeCandidates(
  input: {
    name?: string;
    address?: string;
    note?: string;
    sourceSnippet?: string;
  },
  destinationHint?: string,
): string[] {
  const name = (input.name || "").trim();
  const address = sanitizeAddressForGeocode(input.address, destinationHint);
  const blob = [name, address, input.note, input.sourceSnippet]
    .filter(Boolean)
    .join(" ");
  const hint = (destinationHint || "").trim();
  const region = inferRegionBias(hint, address);
  const regionLabel = region?.label;
  const candidates: string[] = [];
  const addrHints = extractAddressHints(address);

  // 0) ローカル辞書ラベル＋行き先
  const local = resolveLocalTravelPlace(name);
  if (local) {
    pushUnique(candidates, local.label);
    if (regionLabel) pushUnique(candidates, `${regionLabel} ${local.label}`);
  }

  // 1) 行き先＋名前（北海道 知床 など）
  if (name && regionLabel) {
    pushUnique(candidates, `${regionLabel} ${stripNoise(name) || name}`);
  }

  // 2) 住所付き（汚染除去後のみ）
  if (name && address) {
    pushUnique(candidates, `${name} ${address}`);
    for (const h of addrHints) {
      pushUnique(candidates, `${name} ${h}`);
    }
  }
  if (address) {
    pushUnique(candidates, address);
    for (const h of addrHints) {
      pushUnique(candidates, h);
      if (regionLabel) pushUnique(candidates, `${regionLabel} ${h}`);
    }
  }

  if (/風連湖/.test(blob) && (region?.id.includes("hokkaido") || /別海|野付|根室/.test(blob))) {
    pushUnique(candidates, "風蓮湖");
    pushUnique(candidates, "風蓮湖 別海");
  }

  const tokens = extractPlaceTokens(blob);
  for (const t of tokens) {
    pushUnique(candidates, t);
    if (regionLabel) pushUnique(candidates, `${regionLabel} ${t}`);
    for (const h of addrHints.slice(0, 2)) {
      pushUnique(candidates, `${t} ${h}`);
    }
  }

  const cleanedName = stripNoise(name);
  if (cleanedName && cleanedName.length <= 40 && !NON_PLACE_WORDS.has(cleanedName)) {
    if (/[一-龥ぁ-んァ-ヶー]{2,}/.test(cleanedName)) {
      pushUnique(candidates, cleanedName);
      if (regionLabel) pushUnique(candidates, `${regionLabel} ${cleanedName}`);
    }
  }

  if (candidates.length === 0 && hint && hint.length <= 20) {
    pushUnique(candidates, hint);
  }

  return candidates.slice(0, 10);
}
