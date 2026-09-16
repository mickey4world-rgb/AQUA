/**
 * 旅の行き先文字列 → 地図ピン拘束用の領域。
 * 北海道特例ではなく、都道府県・主要都市から推論する。
 */

export type GeoRegionBias = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  stateTokens: string[];
  rejectPrefTokens: string[];
  /** 日本国内に限定するか */
  japanOnly: boolean;
};

type PrefSeed = {
  id: string;
  label: string;
  keys: string[];
  lat: number;
  lon: number;
  /** bbox 半幅（度）。広い県は大きめ */
  pad: number;
};

const FOREIGN_REJECT = [
  "中国",
  "china",
  "韓国",
  "korea",
  "台湾",
  "taiwan",
  "usa",
  "アメリカ",
  "米国",
];

/** 主要都道府県（行き先テキスト照合用） */
const PREF_SEEDS: PrefSeed[] = [
  {
    id: "hokkaido",
    label: "北海道",
    keys: ["北海道", "hokkaido", "札幌", "小樽", "函館", "旭川", "釧路", "帯広", "知床", "阿寒", "富良野", "美瑛"],
    lat: 43.5,
    lon: 142.8,
    pad: 3.6,
  },
  {
    id: "tokyo",
    label: "東京都",
    keys: ["東京", "tokyo", "東京都", "渋谷", "新宿", "浅草", "お台場"],
    lat: 35.68,
    lon: 139.76,
    pad: 0.9,
  },
  {
    id: "kanagawa",
    label: "神奈川県",
    keys: ["神奈川", "横浜", "yokohama", "鎌倉", "箱根", "川崎"],
    lat: 35.45,
    lon: 139.64,
    pad: 0.9,
  },
  {
    id: "chiba",
    label: "千葉県",
    keys: ["千葉", "chiba", "舞浜", "成田", "浦安"],
    lat: 35.6,
    lon: 140.12,
    pad: 1.0,
  },
  {
    id: "saitama",
    label: "埼玉県",
    keys: ["埼玉", "saitama", "大宮", "川越"],
    lat: 35.86,
    lon: 139.65,
    pad: 0.9,
  },
  {
    id: "osaka",
    label: "大阪府",
    keys: ["大阪", "osaka", "大阪府", "梅田", "なんば", "USJ"],
    lat: 34.69,
    lon: 135.5,
    pad: 0.8,
  },
  {
    id: "kyoto",
    label: "京都府",
    keys: ["京都", "kyoto", "京都府", "清水寺", "嵐山", "伏見"],
    lat: 35.01,
    lon: 135.77,
    pad: 0.7,
  },
  {
    id: "hyogo",
    label: "兵庫県",
    keys: ["兵庫", "神戸", "kobe", "姫路", "有馬"],
    lat: 34.69,
    lon: 135.2,
    pad: 1.0,
  },
  {
    id: "nara",
    label: "奈良県",
    keys: ["奈良", "nara", "東大寺", "奈良公園"],
    lat: 34.69,
    lon: 135.83,
    pad: 0.7,
  },
  {
    id: "aichi",
    label: "愛知県",
    keys: ["愛知", "名古屋", "nagoya", "豊橋", "熱田"],
    lat: 35.18,
    lon: 136.91,
    pad: 1.0,
  },
  {
    id: "fukuoka",
    label: "福岡県",
    keys: ["福岡", "fukuoka", "博多", "天神", "太宰府"],
    lat: 33.59,
    lon: 130.4,
    pad: 1.0,
  },
  {
    id: "okinawa",
    label: "沖縄県",
    keys: ["沖縄", "okinawa", "那覇", "naha", "美ら海", "石垣", "宮古"],
    lat: 26.21,
    lon: 127.68,
    pad: 2.5,
  },
  {
    id: "hiroshima",
    label: "広島県",
    keys: ["広島", "hiroshima", "宮島", "厳島"],
    lat: 34.39,
    lon: 132.46,
    pad: 1.0,
  },
  {
    id: "miyagi",
    label: "宮城県",
    keys: ["宮城", "仙台", "sendai", "松島"],
    lat: 38.27,
    lon: 140.87,
    pad: 1.0,
  },
  {
    id: "ishikawa",
    label: "石川県",
    keys: ["石川", "金沢", "kanazawa", "兼六園"],
    lat: 36.56,
    lon: 136.66,
    pad: 1.0,
  },
  {
    id: "nagano",
    label: "長野県",
    keys: ["長野", "nagano", "軽井沢", "松本", "上高地"],
    lat: 36.65,
    lon: 138.18,
    pad: 1.2,
  },
  {
    id: "yamanashi",
    label: "山梨県",
    keys: ["山梨", "富士山", "河口湖", "富士急"],
    lat: 35.66,
    lon: 138.57,
    pad: 1.0,
  },
  {
    id: "shizuoka",
    label: "静岡県",
    keys: ["静岡", "熱海", "伊豆", "浜松"],
    lat: 34.98,
    lon: 138.38,
    pad: 1.2,
  },
  {
    id: "kagawa",
    label: "香川県",
    keys: ["香川", "高松", "讃岐", "直島"],
    lat: 34.34,
    lon: 134.04,
    pad: 0.8,
  },
  {
    id: "ehime",
    label: "愛媛県",
    keys: ["愛媛", "松山", "道後"],
    lat: 33.84,
    lon: 132.77,
    pad: 1.0,
  },
];

const ALL_PREF_LABELS = PREF_SEEDS.map((p) => p.label);

function normalizeHaystack(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function rejectTokensFor(selectedLabels: string[]): string[] {
  const keep = new Set(selectedLabels);
  return [
    ...ALL_PREF_LABELS.filter((l) => !keep.has(l)),
    ...FOREIGN_REJECT,
  ];
}

function regionFromSeed(seed: PrefSeed): GeoRegionBias {
  return {
    id: seed.id,
    label: seed.label,
    lat: seed.lat,
    lon: seed.lon,
    bbox: [
      seed.lon - seed.pad,
      seed.lat - seed.pad,
      seed.lon + seed.pad,
      seed.lat + seed.pad,
    ],
    stateTokens: [seed.label, ...seed.keys.slice(0, 4)],
    rejectPrefTokens: rejectTokensFor([seed.label]),
    japanOnly: true,
  };
}

function unionRegions(regions: GeoRegionBias[]): GeoRegionBias {
  if (regions.length === 1) return regions[0]!;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let latSum = 0;
  let lonSum = 0;
  const labels: string[] = [];
  const tokens: string[] = [];
  for (const r of regions) {
    minLon = Math.min(minLon, r.bbox[0]);
    minLat = Math.min(minLat, r.bbox[1]);
    maxLon = Math.max(maxLon, r.bbox[2]);
    maxLat = Math.max(maxLat, r.bbox[3]);
    latSum += r.lat;
    lonSum += r.lon;
    labels.push(r.label);
    tokens.push(...r.stateTokens);
  }
  return {
    id: regions.map((r) => r.id).join("+"),
    label: labels.join("・"),
    lat: latSum / regions.length,
    lon: lonSum / regions.length,
    bbox: [minLon, minLat, maxLon, maxLat],
    stateTokens: [...new Set(tokens)],
    rejectPrefTokens: rejectTokensFor(labels),
    japanOnly: true,
  };
}

export function regionAround(
  lat: number,
  lon: number,
  label: string,
  pad = 1.2,
): GeoRegionBias {
  return {
    id: `around:${label}`,
    label,
    lat,
    lon,
    bbox: [lon - pad, lat - pad, lon + pad, lat + pad],
    stateTokens: [label],
    rejectPrefTokens: [...FOREIGN_REJECT],
    japanOnly: true,
  };
}

export const JAPAN_REGION: GeoRegionBias = {
  id: "japan",
  label: "日本",
  lat: 36.5,
  lon: 138.0,
  bbox: [122.9, 24.0, 146.0, 45.6],
  stateTokens: ["日本", "japan"],
  rejectPrefTokens: [...FOREIGN_REJECT],
  japanOnly: true,
};

/** @deprecated 互換: 北海道単体領域 */
export const HOKKAIDO_REGION = regionFromSeed(PREF_SEEDS[0]!);

/**
 * 行き先テキストからピン拘束領域を推論。
 * 例: 「春の京都」→京都府周辺、「北海道・知床」→北海道、「京都・奈良」→両県の和集合。
 */
export function inferRegionFromDestinationText(
  destinationHint?: string,
  address?: string,
  localAnchor?: { lat: number; lon: number; label: string } | null,
): GeoRegionBias | null {
  const text = [destinationHint, address].filter(Boolean).join(" ");
  const hay = normalizeHaystack(text);
  if (!hay && !localAnchor) return null;

  const matched = PREF_SEEDS.filter((p) =>
    p.keys.some((k) => hay.includes(normalizeHaystack(k))),
  );
  if (matched.length >= 1) {
    return unionRegions(matched.map(regionFromSeed));
  }

  if (localAnchor) {
    return regionAround(localAnchor.lat, localAnchor.lon, localAnchor.label, 1.3);
  }

  // 日本語の行き先だが県名不明 → 日本国内に限定（国外誤爆だけ防ぐ）
  if (/[一-龥ぁ-んァ-ヶ]{2,}/.test(text) || /japan|日本/.test(hay)) {
    return JAPAN_REGION;
  }
  return null;
}

export function listPrefSeedsForTests(): PrefSeed[] {
  return PREF_SEEDS;
}
