import type { AppKey } from "@/lib/types/access-log";
import type { AccessLog } from "@/lib/types/access-log";
import type { TokenUsage } from "@/lib/types/token-usage";
import type {
  SecurityEventSeverity,
  SecurityEventType,
} from "@/lib/types/security-event";

export interface QuotaSummary {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  estimatedCostUsd: number;
}

export interface FeatureUsageSummary {
  feature: string;
  app: AppKey;
  label: string;
  requests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}

export interface AppUsageSummary {
  app: AppKey;
  label: string;
  tokenRequests: number;
  totalTokens: number;
  estimatedCostUsd: number;
  apiCalls: number;
  avgDurationMs: number;
}

export interface DailyUsagePoint {
  date: string;
  totalTokens: number;
  estimatedCostUsd: number;
  apiCalls: number;
}

export interface CostDashboard {
  month: string;
  monthLabel: string;
  quota: QuotaSummary;
  byFeature: FeatureUsageSummary[];
  byApp: AppUsageSummary[];
  dailyUsage: DailyUsagePoint[];
  recentTokens: TokenUsage[];
  recentAccess: AccessLog[];
  azureInfra: AzureInfraCostSummary | null;
}

export interface AzureServiceCost {
  service: string;
  label: string;
  costAmount: number;
}

export interface AzureResourceCost {
  resourceId: string;
  resourceName: string;
  label: string;
  costAmount: number;
  /** AI コスト比較用の注目リソース */
  focus?: "foundry-claude" | "azure-openai";
}

export interface AzureDailyCostPoint {
  date: string;
  costAmount: number;
}

export interface AzureInfraCostSummary {
  configured: boolean;
  month: string;
  currency: string;
  totalCost: number;
  /** RG フィルタ設定時の RG 内合計（参考） */
  resourceGroupCost?: number;
  byService: AzureServiceCost[];
  /** リソース別（Foundry Claude / Azure OpenAI を含む） */
  byResource: AzureResourceCost[];
  daily: AzureDailyCostPoint[];
  scopeLabel: string;
  note?: string;
  error?: string;
}

export interface AccessAnalyticsUserSummary {
  userId: string;
  displayName: string;
  email: string;
  apiCalls: number;
  apps: AppKey[];
  appLabels: string[];
  topFeature: string;
  topFeatureLabel: string;
  lastAccessAt: string;
}

export interface AccessAnalyticsPageSummary {
  app: AppKey;
  appLabel: string;
  feature: string;
  featureLabel: string;
  pageLabel: string;
  apiCalls: number;
  uniqueUsers: number;
  users: Array<{ userId: string; displayName: string; apiCalls: number }>;
  lastAccessAt: string;
}

export interface AccessAnalyticsUserPageRow {
  userId: string;
  displayName: string;
  app: AppKey;
  appLabel: string;
  feature: string;
  featureLabel: string;
  pageLabel: string;
  apiCalls: number;
  avgDurationMs: number;
  lastAccessAt: string;
}

export interface AccessAnalyticsRecentRow {
  id: string;
  userId: string;
  displayName: string;
  app: AppKey;
  appLabel: string;
  feature: string;
  featureLabel: string;
  pageLabel: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  createdAt: string;
}

export interface AccessAnalyticsReport {
  month: string;
  monthLabel: string;
  configured: boolean;
  summary: {
    totalApiCalls: number;
    uniqueUsers: number;
    uniquePages: number;
  };
  byUser: AccessAnalyticsUserSummary[];
  byPage: AccessAnalyticsPageSummary[];
  byUserPage: AccessAnalyticsUserPageRow[];
  byDay: Array<{ date: string; apiCalls: number; uniqueUsers: number }>;
  byApp: Array<{
    app: string;
    appLabel: string;
    apiCalls: number;
    uniqueUsers: number;
  }>;
  recentAccess: AccessAnalyticsRecentRow[];
  security: SecurityAnalyticsReport;
}

export interface SecurityStackComponentView {
  name: string;
  version: string | null;
  kind: "app" | "platform" | "data" | "ai" | "transitive" | "not_used";
  kindLabel: string;
  role: string;
  inUse: boolean;
}

export interface SecurityArchitectureLayerView {
  id: string;
  title: string;
  role: string;
  defenses: string[];
  /** この層で使っている／使っていない部品 */
  components: SecurityStackComponentView[];
}

export interface SecurityStackInventoryView {
  generatedAt: string;
  nodeMajor: number | null;
  summary: string;
  clarifications: string[];
}

export interface SecurityWorldIssueView {
  id: string;
  title: string;
  publishedAt: string;
  severity: "critical" | "high" | "medium" | "low";
  judgment: "affected" | "watch" | "mitigated" | "not_applicable";
  judgmentLabel: string;
  reason: string;
  sourceUrl: string;
  origin?: "cisa-kev" | "nodejs" | "ghsa-npm" | "baseline";
  originLabel?: string;
  vendor?: string | null;
  product?: string | null;
  ransomware?: boolean;
}

export interface SecurityWorldFeedMetaView {
  fetchedAt: string | null;
  live: boolean;
  sources: Array<{
    source: string;
    label: string;
    ok: boolean;
    count: number;
    checkedAt: string | null;
    error?: string | null;
  }>;
  scanned: number;
  notApplicable: number;
}

export interface SecurityAttackInsightsView {
  flows: SecurityAttackFlowView[];
  byCountry: Array<{ country: string; code: string | null; count: number }>;
  byTarget: Array<{ targetKind: string; targetLabel: string; count: number }>;
  narrative: string[];
  totalEvents: number;
}

export interface SecurityAttackFlowView {
  country: string;
  targetKind: string;
  targetLabel: string;
  pathSample: string;
  reasonSample: string;
  count: number;
}

export interface SecurityAnalyticsReport {
  /** 集計対象月 YYYY-MM（攻撃履歴の履歴キー） */
  month: string;
  monthLabel: string;
  summary: {
    blockedEvents: number;
    highSeverityEvents: number;
    uniqueSources: number;
    affectedPaths: number;
  };
  /** 素人向け: いまの構成の層 */
  architectureLayers: SecurityArchitectureLayerView[];
  /** 利用部品の要約（層ごとの詳細は architectureLayers.components） */
  stackInventory: SecurityStackInventoryView;
  /** 世の中の重要問題 × この環境の該当判定 */
  worldIssues: SecurityWorldIssueView[];
  worldIssuesSummary: { level: "ok" | "warn" | "critical"; text: string };
  worldFeedMeta: SecurityWorldFeedMetaView;
  /** 国 → 攻撃場所 → 件数 */
  attackInsights: SecurityAttackInsightsView;
  /** 攻撃の種類ごとの内訳（パネルのクリックで下の図を絞り込む） */
  byTypeDetail: Array<{
    eventType: SecurityEventType;
    insights: SecurityAttackInsightsView;
    byDay: Array<{ date: string; count: number }>;
  }>;
  /** 同じ送信元からの集中（5回以上のみ） */
  suspiciousSources: Array<{
    sourceHash: string;
    country: string;
    code: string | null;
    count: number;
    distinctPaths: number;
    pattern: "brute_force" | "scan" | "flood";
    patternLabel: string;
    topLabel: string;
    firstAt: string;
    lastAt: string;
  }>;
  countryCoverage: { known: number; total: number; note: string };
  byType: Array<{
    eventType: SecurityEventType;
    label: string;
    count: number;
    mitigation: string;
  }>;
  byCountry: Array<{
    country: string;
    count: number;
  }>;
  byDay: Array<{
    date: string;
    count: number;
  }>;
  recentEvents: Array<{
    id: string;
    eventType: SecurityEventType;
    severity: SecurityEventSeverity;
    attackLabel: string;
    path: string;
    method: string;
    statusCode: number;
    sourceHash: string;
    country: string;
    region: string;
    mitigation: string;
    createdAt: string;
  }>;
  coverageNote: string;
  /** 最新の AI 日次診断（未実行・取得失敗は null） */
  latestTriage: {
    dateJst: string;
    generatedAt: string;
    /** 生成からの経過時間（サーバー算出） */
    ageHours: number;
    level: "ok" | "warn" | "critical";
    headline: string;
    summary: string;
    reasons: string[];
    actions: Array<{ priority: "now" | "today" | "week"; title: string; detail: string }>;
    aiStatus: "ok" | "failed";
    aiModel: string | null;
    aiReason: string | null;
    counts: Record<"critical" | "high" | "medium" | "low" | "unknown", number>;
    issues: Array<{
      source: "npm-audit" | "dependabot" | "code-scanning" | "secret-scanning" | "platform-runtime";
      severity: "critical" | "high" | "medium" | "low" | "unknown";
      title: string;
      packageName: string | null;
      reason: string;
      ageHours: number | null;
      overdue: boolean;
      url: string | null;
    }>;
    collections: Array<{
      source: string;
      ok: boolean;
      count: number;
      error: string | null;
      optional: boolean;
      /** 確認時刻（旧データは null。その場合は診断時刻を使う） */
      checkedAt: string | null;
      alternative: {
        label: string;
        ok: boolean;
        count: number;
        checkedAt: string | null;
        detail: string | null;
      } | null;
    }>;
    events: {
      total: number;
      high: number;
      autoBlocked: number;
      topTargets: Array<{ label: string; count: number }>;
    } | null;
    openSecurityPrs: Array<{
      number: number;
      title: string;
      url: string;
      createdAt?: string;
      kind?: "dependency" | "platform";
    }>;
    appliedAutoPatches: Array<{
      number: number;
      title: string;
      url: string;
      mergedAt?: string;
      kind?: "dependency" | "platform";
    }>;
    modelSelection: {
      selected: string | null;
      resolvedVersion: string | null;
      previous: string | null;
      switchedAt: string | null;
      checkedAt: string;
      probes: Array<{ model: string; ok: boolean; latencyMs: number; resolvedVersion?: string | null; reason?: string | null }>;
    } | null;
    /** その日に保存した世界重要問題の判定（旧データは欠落可） */
    worldIssues?: SecurityWorldIssueView[];
    worldFeedMeta?: SecurityWorldFeedMetaView;
  } | null;
  /** 直近の診断レベル推移（古い順。取得失敗は null）。日付選択で過去診断を開く */
  triageHistory: Array<{ dateJst: string; level: "ok" | "warn" | "critical"; aiStatus: "ok" | "failed" }> | null;
  /** 現在有効な自動ブロック（取得失敗は null） */
  activeAutoBlocks: Array<{
    blockedUntil: string;
    lastBlockedAt: string;
    blockCount: number;
    lastAttackLabel: string;
    lastPath: string;
    country: string | null;
  }> | null;
}

export interface PublicAccessAnalyticsPageSummary {
  pathname: string;
  pageLabel: string;
  pageGroup: string;
  pageGroupLabel: string;
  section: string | null;
  pageViews: number;
  uniqueVisitors: number;
}

export interface PublicAccessAnalyticsDayPoint {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
}

export interface PublicAccessAnalyticsReferrerRow {
  referrer: string;
  count: number;
}

export interface PublicAccessAnalyticsBucketRow {
  key: string;
  label: string;
  pageViews: number;
  uniqueVisitors: number;
}

export interface PublicAccessAnalyticsRecentRow {
  id: string;
  pathname: string;
  pageLabel: string;
  pageGroup: string;
  section: string | null;
  visitorMask: string;
  referrer: string;
  device: string;
  browser: string;
  os: string;
  language: string;
  timezone: string;
  screen: string;
  country: string;
  region: string;
  city: string;
  createdAt: string;
}

export interface PublicAccessAnalyticsReport {
  month: string;
  monthLabel: string;
  configured: boolean;
  summary: {
    pageViews: number;
    uniqueVisitors: number;
    uniquePages: number;
    /** 同一訪問者を含む PV（= pageViews） */
    pageViewsIncludingRepeats: number;
    /** 同一訪問者を除いた UU */
    uniqueVisitorsExcludingRepeats: number;
  };
  byPage: PublicAccessAnalyticsPageSummary[];
  byGroup: PublicAccessAnalyticsBucketRow[];
  byDay: PublicAccessAnalyticsDayPoint[];
  byReferrer: PublicAccessAnalyticsReferrerRow[];
  byBrowser: PublicAccessAnalyticsBucketRow[];
  byOs: PublicAccessAnalyticsBucketRow[];
  byDevice: PublicAccessAnalyticsBucketRow[];
  byCountry: PublicAccessAnalyticsBucketRow[];
  byLanguage: PublicAccessAnalyticsBucketRow[];
  byTimezone: PublicAccessAnalyticsBucketRow[];
  recentViews: PublicAccessAnalyticsRecentRow[];
  notes: string[];
}

/** Soluna 資産運用・BOINC 運用分析（コストダッシュボード用） */
export interface SolunaOpsTradeRow {
  id: string;
  createdAt: string;
  side: "BUY" | "SELL";
  product: string;
  sizeJpy: number;
  priceBtc: number;
  realizedPnlJpy?: number;
  reason: string;
  /** 適用条件番号（複数可） */
  ruleIds?: number[];
  /** 番号付き詳細理由 */
  reasonDetail?: string | null;
  /** 明細表示用（例: #11+#12 · 利確） */
  reasonLabel?: string;
  briefingId: string;
}

export interface SolunaOpsTradeRuleRow {
  id: number;
  category: string;
  categoryLabel: string;
  title: string;
  summary: string;
}

/** 売買監査AIの1件（コスト画面用） */
export interface SolunaOpsTradeLessonRow {
  id: string;
  createdAt: string;
  decisionAction: "BUY" | "SELL" | "HOLD";
  verdict: "good" | "mixed" | "bad";
  summary: string;
  reflections: string[];
  praises: string[];
  model: string;
  provider: string;
}

/** JST 1日分の売買サマリー */
export interface SolunaOpsDaySummary {
  date: string; // YYYY-MM-DD (JST)
  label: string;
  tradeCount: number;
  buyYen: number;
  sellYen: number;
  realizedPnlYen: number;
  buyCount: number;
  sellCount: number;
  products: string[];
}

/** JST 時間帯バケット（0–23） */
export interface SolunaOpsHourBucket {
  hour: number; // 0-23 JST
  label: string; // "09時"
  tradeCount: number;
  buyYen: number;
  sellYen: number;
  realizedPnlYen: number;
  actions: Array<{
    time: string;
    side: "BUY" | "SELL";
    product: string;
    sizeJpy: number;
    reason: string;
    reasonLabel?: string;
  }>;
}

export interface SolunaOpsBoincRunRow {
  id: string;
  briefingId: string;
  createdAt: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string;
  creditGranted: number | null;
  tasksCompleted: number | null;
  projectName: string | null;
  projectUrl: string | null;
  finishedAt: string | null;
}

export interface SolunaOpsFacilityRow {
  id: string;
  name: string;
  location: string;
  levelLabel: string;
  builtAt: string;
}

export interface SolunaOpsNoteArticleRow {
  id: string;
  title: string;
  createdAt: string | null;
  published: boolean;
  noteKey: string | null;
  noteUrl: string | null;
  priceYen: number | null;
  error: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface SolunaOpsNoteReport {
  configured: boolean;
  creatorUrl: string | null;
  monthPublishCount: number;
  monthDraftOrFailedCount: number;
  monthPaidPublishCount: number;
  latestPublishedAt: string | null;
  latestTitle: string | null;
  latestNoteUrl: string | null;
  monthViewCount: number | null;
  lifetimeViewCount: number | null;
  paidSalesCount: number | null;
  paidSalesNote: string;
  pvError: string | null;
  articles: SolunaOpsNoteArticleRow[];
  topByViews: SolunaOpsNoteArticleRow[];
}

export interface SolunaOpsProductMonthStat {
  product: string;
  label: string;
  buyYen: number;
  sellYen: number;
  buyCount: number;
  sellCount: number;
  realizedPnlYen: number;
  held: number;
  valueYen: number;
  priceYen: number;
  allocationPct: number;
  /** 平均取得単価（円） */
  avgBuyPriceYen: number | null;
  /** 買い履歴が無く現在値を仮置きした取得単価 */
  avgBuyEstimated?: boolean;
  /** 軟利確の目安売値（平均取得 × soft TP） */
  targetSellSoftYen: number | null;
  /** 硬利確の目安売値（平均取得 × hard TP） */
  targetSellHardYen: number | null;
  /** 現状保有を軟利確で売った場合の想定利益（円） */
  expectedProfitSoftYen: number | null;
  /** 現状保有を硬利確で売った場合の想定利益（円） */
  expectedProfitHardYen: number | null;
}

export interface SolunaOpsAnalyticsReport {
  month: string;
  monthLabel: string;
  bitFlyerConfigured: boolean;
  updatedAt: string | null;
  assets: {
    status: string;
    sleepMode: boolean;
    battleMode: string;
    principalYen: number;
    totalYen: number;
    cashYen: number;
    btcHeld: number;
    ethHeld: number;
    xrpHeld: number;
    xlmHeld: number;
    btcPriceYen: number;
    ethPriceYen: number;
    xrpPriceYen: number;
    xlmPriceYen: number;
    btcValueYen: number;
    ethValueYen: number;
    xrpValueYen: number;
    xlmValueYen: number;
    cashAllocationPct: number;
    btcAllocationPct: number;
    ethAllocationPct: number;
    xrpAllocationPct: number;
    xlmAllocationPct: number;
    previousTotalYen: number;
    dayChangeYen: number;
    monthlyTargetYen: number;
    monthlyRealizedPnlYen: number;
    targetProgressPct: number;
    golemLevel: number;
    dragonLevel: number;
    phoenixLevel: number;
    seaDragonLevel: number;
    silverShipLevel: number;
    monthBuyYen: number;
    monthSellYen: number;
    monthTradeCount: number;
    monthRealizedPnlYen: number;
    byProduct: SolunaOpsProductMonthStat[];
    /** 前日（JST）の約定サマリー */
    yesterday: SolunaOpsDaySummary;
    /** 今日（JST）の約定サマリー */
    today: SolunaOpsDaySummary;
    /** 今日の時間帯別状況（約定があった時間＋空の枠を含む 0–23） */
    todayHourly: SolunaOpsHourBucket[];
    /** 前日の時間帯別（約定があった時間のみ） */
    yesterdayHourly: SolunaOpsHourBucket[];
    trades: SolunaOpsTradeRow[];
    /** 自動売買条件カタログ（明細の #番号 と対応） */
    tradeRules?: SolunaOpsTradeRuleRow[];
    /** 直近の売買監査AI評価（新しい順・最大8） */
    tradeLessons?: SolunaOpsTradeLessonRow[];
    monthlySummaries: Array<{
      month: string;
      openingBalanceYen: number;
      targetProfitYen: number;
      realizedPnlYen: number;
      goalReached: boolean;
    }>;
    /** 元本 + 累積実現損益の推移（保有時価は含めない） */
    equityPerformance: {
      principalYen: number;
      startDate: string;
      currentTotalYen: number;
      currentCashYen: number;
      pnlYen: number;
      pnlPct: number;
      monthlyTargetYen: number;
      monthGoalTotalYen: number;
      monthlyRealizedPnlYen: number;
      points: Array<{
        date: string;
        label: string;
        totalYen: number;
        cashYen: number;
        pnlYen: number;
        monthGoalTotalYen: number;
        buyYen: number;
        sellYen: number;
        tradeCount: number;
        source: string;
      }>;
      weeklyPoints: Array<{
        date: string;
        label: string;
        totalYen: number;
        cashYen: number;
        pnlYen: number;
        monthGoalTotalYen: number;
        buyYen: number;
        sellYen: number;
        tradeCount: number;
        source: string;
      }>;
      markers: Array<{
        id: string;
        date: string;
        at: string;
        side: "BUY" | "SELL";
        product: string;
        sizeJpy: number;
        realizedPnlJpy?: number;
        totalYen: number;
      }>;
    };
    solComment: string;
    lunaComment: string;
  } | null;
  note: SolunaOpsNoteReport;
  boinc: {
    monthRunCount: number;
    monthPlannedMinutes: number;
    monthActualMinutes: number;
    monthCreditGranted: number;
    monthTasksCompleted: number;
    lifetimePlannedMinutes: number;
    lifetimeActualMinutes: number;
    lifetimeCreditGranted: number;
    lifetimeTasksCompleted: number;
    runs: SolunaOpsBoincRunRow[];
  };
  settlement: {
    settlementName: string;
    settlementLevel: string;
    cumulativeMinutes: number;
    analysisSlots: number;
    facilities: SolunaOpsFacilityRow[];
    latestHeadline: string | null;
    latestTopic: string | null;
  } | null;
}
