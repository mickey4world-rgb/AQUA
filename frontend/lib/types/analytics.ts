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
}
