import { auToKm } from "@/lib/space-utils";

const EARTH_RADIUS_KM = 6371;
const ATMOSPHERE_KM = 100;

const REGION_BANDS: string[][] = [
  ["日本", "フィリピン", "西太平洋"],
  ["アメリカ合衆国（西海岸）", "メキシコ", "東太平洋"],
  ["ブラジル", "アルゼンチン", "南大西洋"],
  ["インド", "インドネシア", "インド洋"],
  ["オーストラリア", "ニュージーランド", "南太平洋"],
  ["南アフリカ", "マダガスカル", "南インド洋"],
  ["イギリス", "フランス", "北大西洋"],
  ["中国", "韓国", "東シナ海"],
  ["カナダ", "グリーンランド", "北極圏"],
  ["チリ", "ペルー", "南東太平洋"],
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** 標準正規分布の CDF（近似） */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function formatImpactProbabilityPercent(probability: number): string {
  if (!Number.isFinite(probability) || probability <= 0) return "0%";
  const pct = probability * 100;
  if (pct < 1e-8) return "< 0.00000001%";
  if (pct < 0.0001) return `${pct.toExponential(2)}%`;
  if (pct < 1) return `${pct.toPrecision(3)}%`;
  if (pct >= 99.9) return "> 99.9%";
  return `${pct.toFixed(2)}%`;
}

/**
 * この接近イベントの衝突確率を、最接近距離と距離不確実性から簡易推定する。
 * 公式の Sentry IP ではない教育用モデル。
 */
export function estimateApproachImpactProbability(input: {
  distanceAu: number;
  distanceMinAu: number;
  distanceMaxAu: number;
  diameterKm?: number;
}): number {
  const earthHitKm = EARTH_RADIUS_KM + ATMOSPHERE_KM + (input.diameterKm ?? 0.05) / 2;
  const nominalKm = auToKm(input.distanceAu);
  const minKm = auToKm(input.distanceMinAu);
  const maxKm = auToKm(input.distanceMaxAu);

  // 3σ 最小が地球半径より十分遠ければ実質ゼロ
  if (minKm > earthHitKm * 80) return 0;

  const spread = Math.max((maxKm - minKm) / 6, nominalKm * 0.02, 500);
  // P(距離 < 地球半径) を正規分布近似
  const z = (earthHitKm - nominalKm) / spread;
  const p = normalCdf(z);
  return Math.min(0.999, Math.max(0, p));
}

export function pickNearbyRegions(seedKey: string, impactProbability: number): string[] | undefined {
  if (impactProbability < 1e-7) return undefined;
  const band = REGION_BANDS[hashString(seedKey) % REGION_BANDS.length];
  const count = impactProbability > 1e-4 ? 3 : 2;
  return band.slice(0, count);
}

/**
 * CAD の cd（例: 2028-Jun-26 05:23）を UTC 近似の Date にする。
 */
export function parseCadDateToUtc(cd: string): Date | null {
  const match = cd.trim().match(
    /^(\d{4})-([A-Za-z]{3})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (!match) return null;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mon = months[match[2]] ?? "01";
  const day = match[3].padStart(2, "0");
  const hh = (match[4] ?? "00").padStart(2, "0");
  const mm = (match[5] ?? "00").padStart(2, "0");
  const iso = `${match[1]}-${mon}-${day}T${hh}:${mm}:00Z`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatCloseApproachJst(cd: string): { jst: string; at: number } {
  const date = parseCadDateToUtc(cd);
  if (!date) {
    return { jst: cd, at: 0 };
  }
  const jst = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { jst: `${jst}（日本時間）`, at: date.getTime() };
}
