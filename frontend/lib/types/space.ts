export type SpaceTab = "telescope" | "asteroid";

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
