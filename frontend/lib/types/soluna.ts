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

export type SolunaMessageRole = "user" | "sol" | "luna";

export interface SolunaMessage {
  id: string;
  userId: string;
  role: SolunaMessageRole;
  content: string;
  createdAt: string;
  provider?: SolunaProvider;
  model?: string;
  modelLabel?: string;
  routeReason?: string;
}

export type SolunaSystemMessageRole = "sol" | "luna" | "system";

export type SolunaMonsterSpecies = "dragon" | "slime" | "golem" | "shadow" | "chimera";
export type SolunaMonsterRank = 1 | 2 | 3 | 4 | 5;
export type SolunaBattleOutcome = "victory" | "escape";
export type SolunaMedalKind = "bronze" | "silver" | "gold" | "rainbow";

export interface SolunaNewsMonster {
  name: string;
  species: SolunaMonsterSpecies;
  speciesLabel: string;
  rank: SolunaMonsterRank;
  hp: number;
  hpMax: number;
  weakness: string;
}

export interface SolunaNewsItem {
  title: string;
  summary: string;
  sourceUrl?: string;
  keyword: string;
  monster?: SolunaNewsMonster;
}

export interface SolunaNewsBriefing {
  id: string;
  keywords: string[];
  items: SolunaNewsItem[];
  fetchedAt: string;
  summary: string;
}

export type SolunaSystemMessageKind = "narration" | "battle-recap";

export interface SolunaSystemMessage {
  id: string;
  role: SolunaSystemMessageRole;
  content: string;
  createdAt: string;
  provider?: "openai" | "claude";
  model?: string;
  modelLabel?: string;
  briefingId?: string;
  kind?: SolunaSystemMessageKind;
}

export interface SolunaBattleLoot {
  medal: SolunaMedalKind | null;
  itemName: string | null;
  itemFlavor: string | null;
  xpGained: number;
}

export interface SolunaBattleResult {
  id: string;
  briefingId: string;
  createdAt: string;
  outcome: SolunaBattleOutcome;
  heat: number;
  depth: number;
  bossName: string;
  bossRank: SolunaMonsterRank;
  newsTitle?: string;
  newsPlain?: string;
  outcomeWhy?: string;
  impression: string;
  nextMove: string;
  loot: SolunaBattleLoot;
  levelAfter: number;
  xpAfter: number;
}

export interface SolunaHunterInventoryItem {
  id: string;
  name: string;
  flavor: string;
  acquiredAt: string;
  briefingId?: string;
}

export interface SolunaHunterState {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  medals: Record<SolunaMedalKind, number>;
  inventory: SolunaHunterInventoryItem[];
  battles: SolunaBattleResult[];
  updatedAt: string;
}

export interface SolunaCharacterMood {
  happiness: number;
  energy: number;
}

export interface SolunaSystemCharacterPersonality {
  character: "sol" | "luna";
  mood: SolunaCharacterMood;
  /** 今週の隠れた関心事（2件） */
  interests: string[];
  interestsRotatedAt: string;
}

export interface SolunaSystemEpisode {
  id: string;
  character: "sol" | "luna" | "pair";
  highlight: string;
  summary: string;
  topics: string[];
  createdAt: string;
  briefingId?: string;
}

export interface SolunaSystemPersonalityState {
  pairIntimacy: number;
  sol: SolunaSystemCharacterPersonality;
  luna: SolunaSystemCharacterPersonality;
  updatedAt: string;
}

export interface SolunaSystemStateResponse {
  briefing: SolunaNewsBriefing | null;
  messages: SolunaSystemMessage[];
  keywords: string[];
  lastRunAt: string | null;
  configured: boolean;
  personality: SolunaSystemPersonalityState | null;
  recentEpisodes: SolunaSystemEpisode[];
  hunter: SolunaHunterState | null;
  latestBattle: SolunaBattleResult | null;
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

export type SolunaGrowthTier = "budding" | "growing" | "mature";

export type SolunaProvider = "gemini" | "openai" | "claude";

export interface SolunaCharacterState {
  character: SolunaCharacter;
  name: string;
  nameJa: string;
  symbol: string;
  intimacy: number;
  interactions: number;
  stage: SolunaGrowthStage;
  model: string;
  provider: SolunaProvider;
  growthTier?: SolunaGrowthTier;
  tierLevel?: 1 | 2 | 3;
  routeReason?: string;
  memories: SolunaMemory[];
}

export interface SolunaStateResponse {
  profile: SolunaProfile;
  sol: SolunaCharacterState;
  luna: SolunaCharacterState;
  messages: SolunaMessage[];
  shortcutToken: string;
  configured: boolean;
  costMode?: "normal" | "economy" | "minimal";
  costReason?: string;
}

export interface SolunaChatReply {
  character: SolunaCharacter;
  content: string;
  model: string;
  modelLabel?: string;
  provider: SolunaProvider;
  growthTier?: SolunaGrowthTier;
  tierLevel?: 1 | 2 | 3;
  routeReason?: string;
}

export interface SolunaRoutePlanSnapshot {
  sol: {
    provider: SolunaProvider;
    model: string;
    tier?: SolunaGrowthTier;
    tierLevel?: 1 | 2 | 3;
    reason: string;
  };
  luna: {
    provider: SolunaProvider;
    model: string;
    tier?: SolunaGrowthTier;
    tierLevel?: 1 | 2 | 3;
    reason: string;
  };
}

export interface SolunaChatResponse {
  sol: SolunaChatReply;
  luna: SolunaChatReply;
  routePlan: SolunaRoutePlanSnapshot;
  solIntimacy: number;
  lunaIntimacy: number;
  solStage: SolunaGrowthStage;
  lunaStage: SolunaGrowthStage;
  newMemories: SolunaMemory[];
  messages: SolunaMessage[];
  costMode?: "normal" | "economy" | "minimal";
  costReason?: string;
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
