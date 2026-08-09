import type { CosmicLocation, CosmicScale } from "@/lib/types/space";

const CONSTELLATION_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  { name: "オリオン座", patterns: [/orion/i, /オリオン/] },
  { name: "アンドロメダ座", patterns: [/andromeda/i, /アンドロメダ/] },
  { name: "さそり座", patterns: [/scorpius/i, /scorpio/i, /さそり/] },
  { name: "こぐま座", patterns: [/ursa minor/i, /little dipper/i, /こぐま/] },
  { name: "みずがめ座", patterns: [/aquarius/i, /みずがめ/] },
  { name: "いて座", patterns: [/sagittarius/i, /いて/] },
  { name: "ペルセウス座", patterns: [/perseus/i, /ペルセウス/] },
  { name: "カシオペヤ座", patterns: [/cassiopeia/i, /カシオペヤ/] },
  { name: "はくちょう座", patterns: [/cygnus/i, /はくちょう/] },
  { name: "みずへび座", patterns: [/hydra/i, /みずへび/] },
];

/** 天の川銀河内・太陽系のおおよその位置（シーン座標） */
export const SUN_GALACTIC_POSITION: [number, number, number] = [5.8, 0.06, 1.9];

/** 銀河外スケール時の天の川の中心（縮小表示） */
export const MILKY_WAY_CONTEXT_POSITION: [number, number, number] = [0, 0, 0];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function parseDistanceLy(text: string): number | undefined {
  const lyMatch = text.match(/([\d,.]+)\s*(?:light[- ]?years?|ly\b)/i);
  if (lyMatch) return parseFloat(lyMatch[1].replace(/,/g, ""));
  const pcMatch = text.match(/([\d,.]+)\s*(?:parsecs?|pc\b)/i);
  if (pcMatch) return parseFloat(pcMatch[1].replace(/,/g, "")) * 3.262;
  const millionLy = text.match(/([\d,.]+)\s*million\s*light[- ]?years?/i);
  if (millionLy) return parseFloat(millionLy[1].replace(/,/g, "")) * 1_000_000;
  const billionLy = text.match(/([\d,.]+)\s*billion\s*light[- ]?years?/i);
  if (billionLy) return parseFloat(billionLy[1].replace(/,/g, "")) * 1_000_000_000;
  const kmMatch = text.match(/([\d,.]+)\s*(?:million|billion)\s*(?:kilometers|km)/i);
  if (kmMatch) {
    const num = parseFloat(kmMatch[1].replace(/,/g, ""));
    const mult = /billion/i.test(kmMatch[0]) ? 1e9 : 1e6;
    return (num * mult) / 9.461e12;
  }
  return undefined;
}

function markerFromSeed(
  seed: number,
  scale: CosmicScale,
  distanceLy?: number,
): [number, number, number] {
  const angle = ((seed % 360) * Math.PI) / 180;
  let radius: number;

  if (scale === "deep-universe") {
    // 距離がある場合は半径に反映（可観測宇宙スケールの相対）
    const d = distanceLy ?? 500_000_000;
    radius = 14 + Math.min(18, Math.log10(Math.max(d, 1e6)) * 3);
  } else if (scale === "local-group") {
    const d = distanceLy ?? 2_500_000;
    radius = 11 + Math.min(6, (d / 2_500_000) * 3);
  } else if (scale === "milky-way") {
    const d = distanceLy ?? 5_000;
    radius = 2.2 + Math.min(7.5, (d / 50_000) * 7);
  } else {
    radius = 0;
  }

  const y = (((seed >> 4) % 80) - 40) / (scale === "deep-universe" ? 40 : 120);
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function detectConstellation(text: string): string | undefined {
  for (const c of CONSTELLATION_PATTERNS) {
    if (c.patterns.some((p) => p.test(text))) return c.name;
  }
  return undefined;
}

function detectLocalBody(text: string): string | undefined {
  if (/moon\b|月/.test(text)) return "月";
  if (/mars\b|火星/.test(text)) return "火星";
  if (/jupiter\b|木星/.test(text)) return "木星";
  if (/saturn\b|土星/.test(text)) return "土星";
  if (/venus\b|金星/.test(text)) return "金星";
  if (/mercury\b|水星/.test(text)) return "水星";
  if (/sun\b|solar|太陽/.test(text)) return "太陽";
  if (/earth\b|地球/.test(text)) return "地球";
  return undefined;
}

function shortTargetLabel(title: string, max = 28): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function inferCosmicLocation(title: string, explanation: string): CosmicLocation {
  const text = `${title} ${explanation}`;
  const lower = text.toLowerCase();
  const seed = hashString(title);
  const distanceLy = parseDistanceLy(text);
  const constellation = detectConstellation(text);
  const localBody = detectLocalBody(lower);
  const targetLabel = shortTargetLabel(title);

  let scale: CosmicScale = "milky-way";
  let regionLabel = "天の川銀河";
  let positionLabel = constellation ?? "銀河ディスク内";

  const isAndromeda = /andromeda|m31|m32/i.test(text);
  const isLocalGroup =
    isAndromeda ||
    /local group|局部銀河群|三角座銀河|m33|magellanic/i.test(text);
  const isDeep =
    /hubble deep|jwst deep|cosmic web|quasar|high[- ]redshift|高赤方偏移|gravitational lens/i.test(
      text,
    ) ||
    (distanceLy !== undefined && distanceLy > 50_000_000);
  const isExternalGalaxy =
    (/galaxy|銀河/.test(text) &&
      !/milky way|天の川|our galaxy|この銀河円盤/i.test(text)) ||
    (distanceLy !== undefined && distanceLy > 100_000);

  if (isDeep) {
    scale = "deep-universe";
    regionLabel = "可観測宇宙";
    positionLabel = constellation
      ? `${constellation}方向の遠方`
      : "遠方銀河・大規模構造";
  } else if (isLocalGroup || (isExternalGalaxy && (distanceLy ?? 0) < 50_000_000)) {
    scale = "local-group";
    regionLabel = "局部銀河群";
    positionLabel = isAndromeda
      ? "アンドロメダ銀河（M31）"
      : constellation
        ? `${constellation}方向の近傍銀河`
        : "近傍銀河";
  } else if (
    localBody ||
    /solar system|planetary|rover|curiosity|perseverance|apollo|iss\b|moon|mars surface/i.test(
      lower,
    )
  ) {
    scale = "solar-system";
    regionLabel = "太陽系";
    positionLabel = localBody
      ? `${localBody}付近`
      : constellation
        ? `${constellation}方向・太陽系近傍`
        : "太陽系内";
  } else if (/milky way|galactic center|天の川|銀河中心|銀河円盤/i.test(text)) {
    scale = "milky-way";
    regionLabel = "天の川銀河";
    positionLabel = /galactic center|銀河中心/i.test(text)
      ? "銀河中心方向"
      : constellation
        ? `${constellation}方向`
        : "銀河円盤内";
  } else if (/nebula|星雲|cluster|星団|supernova|超新星/i.test(text)) {
    scale = "milky-way";
    regionLabel = "天の川銀河";
    positionLabel = constellation
      ? `${constellation}方向`
      : "銀河円盤内の星間領域";
  } else if (distanceLy !== undefined && distanceLy > 100_000) {
    scale = "local-group";
    regionLabel = "局部銀河群";
    positionLabel = constellation ? `${constellation}方向` : "近傍宇宙";
  }

  // 距離による最終補正
  if (distanceLy !== undefined) {
    if (distanceLy > 50_000_000) {
      scale = "deep-universe";
      regionLabel = "可観測宇宙";
    } else if (distanceLy > 100_000 && scale === "milky-way") {
      scale = "local-group";
      regionLabel = "局部銀河群";
    }
  }

  const showMilkyWayContext =
    scale === "local-group" || scale === "deep-universe";

  const markerPosition =
    scale === "solar-system"
      ? SUN_GALACTIC_POSITION
      : markerFromSeed(seed, scale, distanceLy);

  return {
    scale,
    regionLabel,
    positionLabel,
    targetLabel,
    distanceLy,
    constellation,
    localBody,
    markerPosition,
    sunGalacticPosition: SUN_GALACTIC_POSITION,
    showLocalSystem: scale === "solar-system",
    showMilkyWayContext,
  };
}
