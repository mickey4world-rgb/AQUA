import type { AppKey } from "@/lib/types/access-log";
import type { AccessLog } from "@/lib/types/access-log";
import type { TokenUsage } from "@/lib/types/token-usage";

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
  recentAccess: AccessAnalyticsRecentRow[];
}

export interface PublicAccessAnalyticsPageSummary {
  pathname: string;
  pageLabel: string;
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

export interface PublicAccessAnalyticsRecentRow {
  id: string;
  pathname: string;
  pageLabel: string;
  visitorMask: string;
  referrer: string;
  device: string;
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
  };
  byPage: PublicAccessAnalyticsPageSummary[];
  byDay: PublicAccessAnalyticsDayPoint[];
  byReferrer: PublicAccessAnalyticsReferrerRow[];
  recentViews: PublicAccessAnalyticsRecentRow[];
}

/** Soluna 資産運用・BOINC 運用分析（コストダッシュボード用） */
export interface SolunaOpsTradeRow {
  id: string;
  createdAt: string;
  side: "BUY" | "SELL";
  sizeJpy: number;
  priceBtc: number;
  realizedPnlJpy?: number;
  reason: string;
  briefingId: string;
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
    btcPriceYen: number;
    ethPriceYen: number;
    btcValueYen: number;
    ethValueYen: number;
    previousTotalYen: number;
    dayChangeYen: number;
    monthlyTargetYen: number;
    monthlyRealizedPnlYen: number;
    targetProgressPct: number;
    golemLevel: number;
    dragonLevel: number;
    monthBuyYen: number;
    monthSellYen: number;
    monthTradeCount: number;
    monthRealizedPnlYen: number;
    trades: SolunaOpsTradeRow[];
    monthlySummaries: Array<{
      month: string;
      openingBalanceYen: number;
      targetProfitYen: number;
      realizedPnlYen: number;
      goalReached: boolean;
    }>;
    solComment: string;
    lunaComment: string;
  } | null;
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
