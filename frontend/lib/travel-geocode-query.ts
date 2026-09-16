/**
 * 旅行行程テキストからジオコード用クエリ候補を作る。
 * 「専用バスにて小樽へ移動」のような文から地名だけを切り出す。
 */

export type LocalTravelPlace = {
  lat: number;
  lon: number;
  label: string;
  keys: string[];
};

/** 主要観光地（特に北海道ツアー）— API 不通時の最後の砦 */
const LOCAL_PLACES: LocalTravelPlace[] = [
  // 北海道
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
  { label: "釧路", lat: 42.9849, lon: 144.382, keys: ["釧路", "kushiro"] },
  { label: "阿寒湖", lat: 43.436, lon: 144.094, keys: ["阿寒湖", "阿寒"] },
  { label: "摩周湖", lat: 43.588, lon: 144.525, keys: ["摩周湖"] },
  { label: "屈斜路湖", lat: 43.57, lon: 144.34, keys: ["屈斜路", "屈斜路湖"] },
  { label: "網走", lat: 44.0206, lon: 144.2734, keys: ["網走"] },
  { label: "帯広", lat: 42.9236, lon: 143.196, keys: ["帯広"] },
  { label: "稚内", lat: 45.4156, lon: 141.673, keys: ["稚内"] },
  { label: "苫小牧", lat: 42.636, lon: 141.603, keys: ["苫小牧"] },
  { label: "室蘭", lat: 42.3152, lon: 140.9738, keys: ["室蘭"] },
  { label: "千歳", lat: 42.821, lon: 141.651, keys: ["千歳"] },
  // 全国のよく出るハブ
  { label: "東京", lat: 35.6812, lon: 139.7671, keys: ["東京", "tokyo"] },
  { label: "羽田空港", lat: 35.5494, lon: 139.7798, keys: ["羽田空港", "羽田"] },
  { label: "成田空港", lat: 35.772, lon: 140.3929, keys: ["成田空港", "成田"] },
  { label: "大阪", lat: 34.6937, lon: 135.5023, keys: ["大阪", "osaka"] },
  { label: "京都", lat: 35.0116, lon: 135.7681, keys: ["京都", "kyoto"] },
];

const PLACE_SUFFIX_RE =
  /[一-龥ぁ-んァ-ヶーA-Za-z0-9]{2,24}(?:駅|空港|温泉|神社|寺院|寺|城|公園|湖|岳|山|橋|港|市場|博物館|美術館|塔|台|通り|通|運河|峠|峡|浜|海岸|展望台|牧場|動物園|水族館)/g;

const MOVE_TO_RE =
  /([一-龥ぁ-んァ-ヶー]{2,16})(?:へ|に)(?:移動|到着|向か|出発|向かう|向かいます)/g;

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

/** 行程文に含まれる既知地名を最長一致で拾う */
export function resolveLocalTravelPlace(text: string): LocalTravelPlace | null {
  const src = text.normalize("NFKC");
  // 「小樽へ移動」「定山渓温泉へ」など移動先を優先
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

/**
 * Photon/Nominatim 向け候補。短い地名から試す。
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
  const blob = [input.name, input.address, input.note, input.sourceSnippet]
    .filter(Boolean)
    .join(" ");
  const hint = (destinationHint || "").trim();
  const candidates: string[] = [];

  const local = resolveLocalTravelPlace(blob);
  if (local) {
    pushUnique(candidates, local.label);
    if (hint && !local.label.includes(hint)) {
      pushUnique(candidates, `${hint} ${local.label}`);
    }
  }

  const tokens = extractPlaceTokens(blob);
  for (const t of tokens) {
    pushUnique(candidates, t);
    if (hint) pushUnique(candidates, `${hint} ${t}`);
  }

  const cleanedName = stripNoise(input.name || "");
  if (cleanedName && cleanedName.length <= 40 && !NON_PLACE_WORDS.has(cleanedName)) {
    // 地名らしい残渣のみ（ひらがな・カタカナ・漢字が残っている）
    if (/[一-龥ぁ-んァ-ヶー]{2,}/.test(cleanedName)) {
      pushUnique(candidates, cleanedName);
      if (hint) pushUnique(candidates, `${hint} ${cleanedName}`);
    }
  } else if (cleanedName && cleanedName.length > 40) {
    const short = cleanedName.slice(0, 24).trim();
    if (/[一-龥ぁ-んァ-ヶー]{2,}/.test(short)) {
      pushUnique(candidates, short);
    }
  }

  if (input.address) {
    const addr = stripNoise(input.address);
    if (addr && /[一-龥ぁ-んァ-ヶーA-Za-z]{2,}/.test(addr)) {
      pushUnique(candidates, addr);
      if (hint) pushUnique(candidates, `${hint} ${addr}`);
    }
  }

  // 行き先のみは最終手段（地名が一切取れないとき）
  if (candidates.length === 0 && hint && hint.length <= 20) {
    pushUnique(candidates, hint);
  }

  return candidates.slice(0, 8);
}
