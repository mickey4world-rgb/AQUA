export type SpaceTab = "telescope" | "asteroid" | "eagle-eye";

export interface ApodEntry {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  mediaType: "image" | "video";
  copyright?: string;
  serviceVersion?: string;
}

export interface WavelengthBand {
  id: string;
  label: string;
  range: string;
  color: string;
  detected: boolean;
  note?: string;
}

export interface ApodAnalysis {
  telescope?: string;
  objectType?: string;
  bands: WavelengthBand[];
  cosmic?: CosmicLocation;
  /** 地球から見たこの写真の光・波長の要約 */
  earthLightSummary?: string;
}

export type CosmicScale = "solar-system" | "milky-way" | "local-group" | "deep-universe";

export interface CosmicLocation {
  scale: CosmicScale;
  regionLabel: string;
  positionLabel: string;
  /** 写真に写る対象の短い表示名（3Dマーカー用） */
  targetLabel: string;
  distanceLy?: number;
  constellation?: string;
  localBody?: string;
  /** 銀河スケールでのマーカー座標 */
  markerPosition: [number, number, number];
  sunGalacticPosition: [number, number, number];
  showLocalSystem: boolean;
  /** 銀河外スケール時、天の川を縮小表示するか */
  showMilkyWayContext: boolean;
}

export interface CloseApproach {
  designation: string;
  fullName?: string;
  /** JPL CAD の生文字列（例: 2028-Jun-26 05:23） */
  closeApproachDate: string;
  /** 日本時間の最接近日時（表示用） */
  closeApproachDateJst: string;
  /** 最接近の Unix ms（UTC 近似） */
  closeApproachAt: number;
  distanceAu: number;
  distanceMinAu: number;
  distanceMaxAu: number;
  distanceMinLd: number;
  distanceMinKm: number;
  velocityKmS: number;
  absoluteMagnitude: number;
  diameterKm?: number;
  /** この接近での衝突確率（0〜1）。幾何・不確実性の簡易推定 */
  impactProbability: number;
  /** 表示用パーセント文字列 */
  impactProbabilityLabel: string;
  /** Sentry 累積衝突確率（あれば） */
  sentryImpactProbability?: number;
  sentryImpactProbabilityLabel?: string;
  /** 衝突しうる場合の参考国・地域（教育用） */
  nearbyRegions?: string[];
  /** あれば小惑星の参考写真 */
  imageUrl?: string;
  imageCredit?: string;
}

export type SpaceChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface SpaceChatContext {
  apod: ApodEntry;
  analysis: ApodAnalysis;
}
