export type SolunaCharacter = "sol" | "luna";

export type SolunaMemoryCategory =
  | "goal"
  | "task"
  | "success"
  | "activity"
  | "emotion"
  | "worry"
  | "health"
  | "comfort";

export interface SolunaMemory {
  id: string;
  userId: string;
  character: SolunaCharacter;
  category: SolunaMemoryCategory;
  content: string;
  createdAt: string;
}

export interface SolunaMessage {
  id: string;
  userId: string;
  role: "user" | "sol" | "luna";
  content: string;
  createdAt: string;
}

export interface SolunaProfile {
  id: string;
  userId: string;
  solIntimacy: number;
  lunaIntimacy: number;
  solInteractions: number;
  lunaInteractions: number;
  createdAt: string;
  updatedAt: string;
}

export interface SolunaGrowthStage {
  id: string;
  label: string;
  min: number;
  max: number;
}

export interface SolunaCharacterState {
  character: SolunaCharacter;
  name: string;
  nameJa: string;
  symbol: string;
  intimacy: number;
  interactions: number;
  stage: SolunaGrowthStage;
  model: string;
  provider: "gemini" | "openai";
  memories: SolunaMemory[];
}

export interface SolunaStateResponse {
  profile: SolunaProfile;
  sol: SolunaCharacterState;
  luna: SolunaCharacterState;
  messages: SolunaMessage[];
  shortcutToken: string;
  configured: boolean;
}

export interface SolunaChatReply {
  character: SolunaCharacter;
  content: string;
  model: string;
}

export interface SolunaChatResponse {
  sol: SolunaChatReply;
  luna: SolunaChatReply;
  solIntimacy: number;
  lunaIntimacy: number;
  solStage: SolunaGrowthStage;
  lunaStage: SolunaGrowthStage;
  newMemories: SolunaMemory[];
  messages: SolunaMessage[];
}

export const SOLUNA_SOL_STAGES: SolunaGrowthStage[] = [
  { id: "dawn", label: "黎明", min: 0, max: 20 },
  { id: "sunrise", label: "朝日", min: 21, max: 40 },
  { id: "noon", label: "盛光", min: 41, max: 60 },
  { id: "blaze", label: "烈陽", min: 61, max: 80 },
  { id: "zenith", label: "至陽", min: 81, max: 100 },
];

export const SOLUNA_LUNA_STAGES: SolunaGrowthStage[] = [
  { id: "new", label: "新月", min: 0, max: 20 },
  { id: "crescent", label: "三日月", min: 21, max: 40 },
  { id: "half", label: "上弦", min: 41, max: 60 },
  { id: "full", label: "満月", min: 61, max: 80 },
  { id: "super", label: "スーパームーン", min: 81, max: 100 },
];

export const SOLUNA_CHARACTER_META = {
  sol: {
    name: "Sol",
    nameJa: "ソル",
    symbol: "☀",
    tagline: "太陽 — 目標と行動の伴走者",
    accent: "amber",
  },
  luna: {
    name: "Luna",
    nameJa: "ルーナ",
    symbol: "🌙",
    tagline: "月 — 感情と癒やしの伴走者",
    accent: "indigo",
  },
} as const;
