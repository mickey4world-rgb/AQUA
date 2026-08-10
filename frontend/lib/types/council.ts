export type CouncilMode = "domestic" | "global";

export type CouncilDepth = "compact" | "standard";

export type CouncilPhase = "initial" | "rebuttal" | "synthesis" | "followup";

export interface CouncilModelMeta {
  id: string;
  label: string;
  provider: "azure" | "openai" | "gemini";
  deployment?: string;
  model?: string;
  displayName?: string;
  role?: "logic" | "creative" | "skeptic" | "explorer" | "judge";
}

export interface CouncilAttachment {
  name: string;
  content: string;
  charCount: number;
}

export type CouncilChatMessage = {
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
};

export interface CouncilModelOpinion {
  modelId: string;
  modelLabel: string;
  phase: CouncilPhase;
  content: string;
  modelUsed?: string;
  provider?: "azure" | "openai" | "gemini";
}

export interface CouncilDebateResult {
  mode: CouncilMode;
  depth: CouncilDepth;
  topic: string;
  models: CouncilModelMeta[];
  judge: CouncilModelMeta;
  attachments: CouncilAttachment[];
  initial: CouncilModelOpinion[];
  rebuttal: CouncilModelOpinion[];
  synthesis: CouncilModelOpinion;
  dataRegionNote: string;
  apiCalls: number;
}

export interface CouncilConfigResponse {
  azureConfigured: boolean;
  geminiConfigured: boolean;
  setupHint?: string;
  depths?: typeof import("@/lib/server/council-config").COUNCIL_DEPTH_CONFIG;
  domestic: {
    available: boolean;
    label: string;
    description: string;
    models: CouncilModelMeta[];
    judge: CouncilModelMeta;
    dataRegion: string;
    warning?: string;
  };
  global: {
    available: boolean;
    label: string;
    description: string;
    models: CouncilModelMeta[];
    judge: CouncilModelMeta;
    dataRegion: string;
    warning?: string;
  };
}
