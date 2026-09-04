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

export interface SolunaEncounterResult {
  role: "trash" | "mid" | "boss";
  monsterName: string;
  rank: SolunaMonsterRank;
  newsTitle: string;
  newsPlain: string;
  outcome: SolunaBattleOutcome;
  xpGained: number;
  /** 物語上のゴールド（小物討伐の微量利益など） */
  goldFlavor: number;
  lootName?: string | null;
}

export interface SolunaJourneySnapshot {
  areaId: string;
  areaName: string;
  regionLabel: string;
  nextAreaId: string;
  nextAreaName: string;
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
  /** 小物＋大ボスの複数戦 */
  encounters?: SolunaEncounterResult[];
  /** 小物勝利数 / 敗北数 */
  wins?: number;
  losses?: number;
  /** 本日の物語ゴールド合計 */
  goldFlavorTotal?: number;
  journey?: SolunaJourneySnapshot;
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
  /** 旅の現在地（エリア ID） */
  currentAreaId?: string;
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

export type SolunaJobStatus = "done" | "queued" | "skipped" | "waiting-spec" | "error";

export interface SolunaNoteArticle {
  id: string;
  briefingId: string;
  createdAt: string;
  title: string;
  freeBody: string;
  paidBody: string;
  priceYen: number;
  published: boolean;
  noteUrl?: string;
  noteKey?: string;
  error?: string;
}

export interface SolunaBoincRun {
  id: string;
  briefingId: string;
  createdAt: string;
  minutes: number;
  itemCount: number;
  status: SolunaJobStatus;
  solComment: string;
  lunaComment: string;
  /** 実行後に GHA から POST される実績値 */
  result?: {
    creditGranted: number;     // BOINC クレジット（cobblestones）
    tasksCompleted: number;    // 完了タスク数
    projectName: string;       // 接続したプロジェクト名
    projectUrl: string;        // プロジェクトURL
    finishedAt: string;        // ISO 文字列
    runMinutesActual: number;  // 実際に実行した分数
  };
}

export type SolunaSettlementLevel = "village" | "town" | "city";
export type SolunaSettlementEventKind = "progress" | "build" | "merge" | "slot";

export interface SolunaSettlementFacility {
  id: string;
  name: string;
  location: string;
  builtAt: string;
  briefingId: string;
  levelLabel: string; // 村レベル / 町レベル など
}

export interface SolunaSettlementDayEvent {
  kind: SolunaSettlementEventKind;
  briefingId: string;
  createdAt: string;
  todayMinutes: number;
  cumulativeMinutes: number;
  headline: string;
  topic: string;
  solComment: string;
  lunaComment: string;
  unlockedFacilityIds: string[];
  settlementLevel: SolunaSettlementLevel;
  analysisSlots: number;
}

/** BOINC パワーで育つ拠点都市アクアピア */
export interface SolunaSettlementState {
  cumulativeMinutes: number;
  settlementLevel: SolunaSettlementLevel;
  settlementName: string;
  facilities: SolunaSettlementFacility[];
  analysisSlots: number;
  latestEvent: SolunaSettlementDayEvent | null;
  updatedAt: string;
}

/** 資産運用での1回の取引記録 */
export type SolunaTradeProduct =
  | "BTC_JPY"
  | "ETH_JPY"
  | "XRP_JPY"
  | "XLM_JPY"
  | "ZPG_JPY";

export interface SolunaTradeRecord {
  id: string;
  createdAt: string;
  side: "BUY" | "SELL";
  product: SolunaTradeProduct;
  sizeJpy: number;       // 取引金額（円）
  /** 約定単価（円）。歴史的なフィールド名で BTC 以外も格納 */
  priceBtc: number;
  realizedPnlJpy?: number; // 実現損益（SELL 時のみ）
  reason: string;        // "dca" | "take-profit" | "stop-loss"
  briefingId: string;
}

/** 月次の資産サマリー */
export interface SolunaMonthlyAssetSummary {
  /** "2026-08" 形式 */
  month: string;
  openingBalanceYen: number;   // 月初総資産
  targetProfitYen: number;     // 月利益目標（月初×2%、下限2000円）
  realizedPnlYen: number;      // 当月累計実現損益
  goalReached: boolean;        // 月次目標達成フラグ
  goalReachedAt?: string;      // 達成日時
}

export type SolunaBattleMode = "attack" | "defense";

export interface SolunaAssetLedger {
  principalYen: number;
  /** 先月末総資産（初回は principalYen） */
  lastMonthTotalYen: number;
  /** 今月利益目標（月初×2%、元本10万未満は一律2000円） */
  monthlyTargetYen: number;
  /** 当月累計実現損益（＝討伐報酬ゴールド） */
  monthlyRealizedPnlYen: number;
  /** おやすみモード（実現損益 ≥ 月初残高 × 10%） */
  sleepMode: boolean;
  /** 現在の BTC 保有量（雷轟の蒼竜） */
  btcHeld: number;
  /** 現在の ETH 保有量（蒼穹の不死鳥） */
  ethHeld: number;
  /** 現在の XRP 保有量（銀濤の海竜） */
  xrpHeld?: number;
  /** 現在の XLM 保有量（星屑の銀帆船） */
  xlmHeld?: number;
  /** ジパングコイン(ZPG) 保有量 — Lightning 自動売買不可のため投資カテゴリ外 */
  zpgHeld?: number;
  /** 現在の現金残高（円）＝黄金の守護巨兵の防衛魔力 */
  cashYen: number;
  /** 総資産（現金 + BTC/ETH/XRP/XLM 時価）＝総魔力 MP */
  totalYen: number;
  /** 前回記録時の総資産（前日比用） */
  previousTotalYen: number;
  /** 前回 BTC 評価額（レベルアップ差分用） */
  previousBtcValueYen: number;
  /** 前回現金残高（ゴーレム Lv 差分用） */
  previousCashYen: number;
  /** 最新 BTC 価格 */
  btcPriceYen: number;
  /** 最新 ETH 価格 */
  ethPriceYen: number;
  /** 最新 XRP 価格 */
  xrpPriceYen?: number;
  /** 最新 XLM 価格 */
  xlmPriceYen?: number;
  /** ZPG 参考価格（Lightning 非対応時は 0） */
  zpgPriceYen?: number;
  /** 前日比に基づくバトルモード（翌日の会話用） */
  battleMode: SolunaBattleMode;
  /** 本日のニュースバトルで使ったバフ／防御（Note 無料リード用） */
  lastPromptBattleMode?: SolunaBattleMode;
  /** 当月取引履歴 */
  trades: SolunaTradeRecord[];
  /** 月次サマリー履歴 */
  monthlySummaries: SolunaMonthlyAssetSummary[];
  medalUnits: number;
  status: SolunaJobStatus;
  solComment: string;
  lunaComment: string;
  updatedAt: string;
}

export interface SolunaJobsState {
  noteConfigured: boolean;
  /** bitFlyer API キーが SWA 環境変数に載っているか */
  bitFlyerConfigured: boolean;
  creatorUrl?: string;
  latestNote: SolunaNoteArticle | null;
  latestBoinc: SolunaBoincRun | null;
  assets: SolunaAssetLedger | null;
  settlement: SolunaSettlementState | null;
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
  jobs: SolunaJobsState | null;
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
