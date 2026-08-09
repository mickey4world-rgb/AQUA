import type { ApodAnalysis, WavelengthBand } from "@/lib/types/space";
import { inferCosmicLocation } from "@/lib/space-celestial";

const AU_KM = 149_597_870.7;
const LD_KM = 384_400;

export function auToKm(au: number): number {
  return au * AU_KM;
}

export function auToLunarDistances(au: number): number {
  return (au * AU_KM) / LD_KM;
}

export function formatDistanceKm(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(2)} 百万 km`;
  if (km >= 1_000) return `${(km / 1_000).toFixed(0)} 千 km`;
  return `${km.toFixed(0)} km`;
}

export function parseCloseApproachDate(cd: string): number {
  const normalized = cd.replace(/(\d{4})-(\w{3})-(\d{1,2})/, (_, y, mon, d) => {
    const months: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    return `${y}-${months[mon] ?? "01"}-${String(d).padStart(2, "0")}`;
  });
  const ts = Date.parse(normalized);
  return Number.isFinite(ts) ? ts : 0;
}

const BASE_BANDS: Omit<WavelengthBand, "detected" | "note">[] = [
  { id: "radio", label: "電波", range: "> 1 mm", color: "#7c3aed" },
  { id: "microwave", label: "マイクロ波", range: "1 mm – 1 cm", color: "#6366f1" },
  { id: "ir", label: "赤外線", range: "700 nm – 1 mm", color: "#ef4444" },
  { id: "visible", label: "可視光", range: "400 – 700 nm", color: "#fbbf24" },
  { id: "uv", label: "紫外線", range: "10 – 400 nm", color: "#a855f7" },
  { id: "xray", label: "X線", range: "0.01 – 10 nm", color: "#22d3ee" },
  { id: "gamma", label: "ガンマ線", range: "< 0.01 nm", color: "#f472b6" },
];

export function inferApodAnalysis(title: string, explanation: string): ApodAnalysis {
  const text = `${title} ${explanation}`.toLowerCase();

  const telescope =
    text.includes("jwst") || text.includes("james webb")
      ? "James Webb Space Telescope (JWST)"
      : text.includes("hubble")
        ? "Hubble Space Telescope"
        : text.includes("chandra")
          ? "Chandra X-ray Observatory"
          : text.includes("spitzer")
            ? "Spitzer Space Telescope"
            : text.includes("curiosity") || text.includes("perseverance")
              ? "火星探査ローバー"
              : text.includes("telescop")
                ? "地上 / 宇宙望遠鏡"
                : undefined;

  const objectType =
    text.includes("nebula") || text.includes("星雲")
      ? "星雲"
      : text.includes("galaxy") || text.includes("銀河")
        ? "銀河"
        : text.includes("supernova") || text.includes("超新星")
          ? "超新星残骸"
          : text.includes("cluster") || text.includes("星団")
            ? "星団"
            : text.includes("mars") || text.includes("火星")
              ? "惑星表面"
              : "天体";

  const rules: { id: string; patterns: RegExp[]; note: string }[] = [
    {
      id: "gamma",
      patterns: [/gamma.?ray/, /ガンマ線/],
      note: "地球からは大気で遮られるが、宇宙望遠鏡が捉えた高エネルギー光",
    },
    {
      id: "xray",
      patterns: [/x-ray/, /xray/, /chandra/],
      note: "地球大気は通さない。宇宙から届く高温ガス・衝撃波の光",
    },
    {
      id: "uv",
      patterns: [/ultraviolet/, /\buv\b/, /紫外/],
      note: "地表では弱い。若い星や星形成領域から地球方向へ来る紫外光",
    },
    {
      id: "visible",
      patterns: [
        /hydrogen/,
        /emission nebula/,
        /reflection nebula/,
        /visible/,
        /optical/,
        /h-alpha/,
        /水素/,
        /星形成/,
      ],
      note: "地球の空・光学望遠鏡に届く可視光（星・ガスの形）",
    },
    {
      id: "ir",
      patterns: [
        /infrared/,
        /\bir\b/,
        /jwst/,
        /spitzer/,
        /mir/,
        /赤外/,
        /polycyclic aromatic/,
        /\bpah/,
      ],
      note: "塵に隠れた構造から地球方向へ届く赤外。JWST 等が検出",
    },
    {
      id: "radio",
      patterns: [/radio/, /電波/],
      note: "大気を通り地上電波望遠鏡にも届く分子線・連続波",
    },
  ];

  const bands: WavelengthBand[] = BASE_BANDS.map((band) => {
    const rule = rules.find((r) => r.id === band.id);
    const detected = rule ? rule.patterns.some((p) => p.test(text)) : false;
    return {
      ...band,
      detected,
      note: detected ? rule?.note : undefined,
    };
  });

  if (!bands.some((b) => b.detected)) {
    const visible = bands.find((b) => b.id === "visible");
    if (visible) {
      visible.detected = true;
      visible.note = "地球から見た光学写真として、主に可視光が届いている";
    }
  }

  const detectedLabels = bands.filter((b) => b.detected).map((b) => b.label);
  const earthLightSummary =
    detectedLabels.length > 0
      ? `地球からこの写真の天体を見ると、主に ${detectedLabels.join("・")} が観測されています。` +
        (telescope ? `（観測: ${telescope}）` : "")
      : "地球から届く光の波長帯を推定中です。";

  return {
    telescope,
    objectType,
    bands,
    cosmic: inferCosmicLocation(title, explanation),
    earthLightSummary,
  };
}

export const spacePanelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md";
