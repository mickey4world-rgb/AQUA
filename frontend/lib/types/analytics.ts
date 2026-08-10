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
