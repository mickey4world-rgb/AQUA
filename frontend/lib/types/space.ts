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
  closeApproachDate: string;
  distanceAu: number;
  distanceMinAu: number;
  distanceMaxAu: number;
  distanceMinLd: number;
  distanceMinKm: number;
  velocityKmS: number;
  absoluteMagnitude: number;
  diameterKm?: number;
}

export type SpaceChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface SpaceChatContext {
  apod: ApodEntry;
  analysis: ApodAnalysis;
}
