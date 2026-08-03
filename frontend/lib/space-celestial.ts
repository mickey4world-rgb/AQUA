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
  const kmMatch = text.match(/([\d,.]+)\s*(?:million|billion)\s*(?:kilometers|km)/i);
  if (kmMatch) {
    const num = parseFloat(kmMatch[1].replace(/,/g, ""));
    const mult = /billion/i.test(text) ? 1e9 : 1e6;
    return (num * mult) / 9.461e12;
  }
  return undefined;
}

function markerFromSeed(seed: number, scale: CosmicScale): [number, number, number] {
  const angle = ((seed % 360) * Math.PI) / 180;
  const radius =
    scale === "deep-universe"
      ? 7.5 + (seed % 30) / 10
      : scale === "local-group"
        ? 11 + (seed % 20) / 10
        : scale === "milky-way"
          ? 2.5 + (seed % 50) / 10
          : 0;
  const y = (((seed >> 4) % 80) - 40) / 120;
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

export function inferCosmicLocation(title: string, explanation: string): CosmicLocation {
  const text = `${title} ${explanation}`;
  const lower = text.toLowerCase();
  const seed = hashString(title);
  const distanceLy = parseDistanceLy(text);
  const constellation = detectConstellation(text);
  const localBody = detectLocalBody(lower);

  let scale: CosmicScale = "milky-way";
  let regionLabel = "天の川銀河";
  let positionLabel = constellation ?? "銀河ディスク内の深宇宙";

  if (
    /andromeda|m31|m32|local group|局部銀河群|三角座銀河|m33/i.test(text)
  ) {
    scale = "local-group";
    regionLabel = "局部銀河群";
    positionLabel = /andromeda|m31/i.test(text)
      ? "アンドロメダ銀河（M31）方向"
      : "近傍銀河群";
  } else if (
    /hubble deep|jwst deep|cosmic web|quasar|distant galaxy|高赤方偏移|10 billion|100 billion/i.test(
      text,
    ) ||
    (distanceLy !== undefined && distanceLy > 50_000_000)
  ) {
    scale = "deep-universe";
    regionLabel = "可観測宇宙の深部";
    positionLabel = "遠方銀河・宇宙大規模構造";
  } else if (
    localBody ||
    /solar system|planetary|rover|curiosity|perseverance|apollo|iss\b|moon|mars surface/i.test(
      lower,
    )
  ) {
    scale = "solar-system";
    regionLabel = "太陽系（天の川銀河内）";
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
  } else if (/nebula|星雲|cluster|星団|supernova|超新星|galaxy|銀河/i.test(text)) {
    scale = "milky-way";
    regionLabel = "天の川銀河";
    positionLabel = /galaxy|銀河/i.test(text)
      ? constellation
        ? `${constellation}方向の銀河`
        : "銀河（天の川外または近傍）"
      : constellation
        ? `${constellation}方向`
        : "銀河円盤内の星間領域";
  }

  const markerPosition =
    scale === "solar-system"
      ? SUN_GALACTIC_POSITION
      : markerFromSeed(seed, scale);

  return {
    scale,
    regionLabel,
    positionLabel,
    distanceLy,
    constellation,
    localBody,
    markerPosition,
    sunGalacticPosition: SUN_GALACTIC_POSITION,
    showLocalSystem: scale === "solar-system",
  };
}
