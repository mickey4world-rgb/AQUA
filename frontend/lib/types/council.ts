export type CouncilMode = "domestic" | "global";

export type CouncilDepth = "compact" | "standard";

export type CouncilPhase = "initial" | "rebuttal" | "synthesis";

export interface CouncilModelMeta {
  id: string;
  label: string;
  provider: "azure" | "openai";
  deployment?: string;
  model?: string;
}

export interface CouncilModelOpinion {
  modelId: string;
  modelLabel: string;
  phase: CouncilPhase;
  content: string;
}

export interface CouncilDebateResult {
  mode: CouncilMode;
  depth: CouncilDepth;
  topic: string;
  models: CouncilModelMeta[];
  initial: CouncilModelOpinion[];
  rebuttal: CouncilModelOpinion[];
  synthesis: CouncilModelOpinion;
  dataRegionNote: string;
  apiCalls: number;
}

export interface CouncilConfigResponse {
  domestic: {
    available: boolean;
    label: string;
    description: string;
    models: CouncilModelMeta[];
    dataRegion: string;
  };
  global: {
    available: boolean;
    label: string;
    description: string;
    models: CouncilModelMeta[];
    dataRegion: string;
    warning?: string;
  };
}
