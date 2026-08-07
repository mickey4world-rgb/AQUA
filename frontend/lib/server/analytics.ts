import {
  APP_LABELS,
  featureApp,
  featureLabel,
} from "@/lib/analytics-constants";
import {
  fetchAzureInfraCosts,
  isAzureCostManagementConfigured,
} from "@/lib/server/azure-cost-management";
import {
  getAccessStatsByApp,
  getDailyAccessCounts,
  listRecentAccessLogs,
} from "@/lib/server/access-log";
import { ensureUserTokenLimit, effectiveTokenLimit } from "@/lib/server/users";
import {
  getDailyTokenUsage,
  getMonthlyTokenCostUsd,
  getMonthlyTokenUsage,
  getTokenStatsByFeature,
  listRecentTokenUsage,
  monthEndIso,
  monthStartIso,
  parseMonthParam,
} from "@/lib/server/token-usage";
import { DEFAULT_MONTHLY_TOKEN_LIMIT } from "@/lib/types/user";
import type { AppKey } from "@/lib/types/access-log";
import type { CostDashboard } from "@/lib/types/analytics";

function monthLabel(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function monthParam(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function buildCostDashboard(
  userId: string,
  month?: string | null,
): Promise<CostDashboard> {
  const monthDate = parseMonthParam(month);
  const start = monthStartIso(monthDate);
  const end = monthEndIso(monthDate);

  const user = await ensureUserTokenLimit(userId);
  const limit = effectiveTokenLimit(user);

  const [
    used,
    estimatedCostUsd,
    byFeatureRaw,
    byAppAccess,
    dailyTokens,
    dailyAccess,
    recentTokens,
    recentAccess,
    azureInfra,
  ] = await Promise.all([
    getMonthlyTokenUsage(userId, monthDate),
    getMonthlyTokenCostUsd(userId, monthDate),
    getTokenStatsByFeature(userId, start, end),
    getAccessStatsByApp(userId, start, end),
    getDailyTokenUsage(userId, start, end),
    getDailyAccessCounts(userId, start, end),
    listRecentTokenUsage(userId, start, end, 30),
    listRecentAccessLogs(userId, start, end, 30),
    isAzureCostManagementConfigured()
      ? fetchAzureInfraCosts(monthParam(monthDate))
      : Promise.resolve(null),
  ]);

  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? (used / limit) * 100 : 0;

  const byFeature = byFeatureRaw.map((row) => {
    const app = featureApp(row.feature);
    return {
      feature: row.feature,
      app,
      label: featureLabel(row.feature),
      requests: row.requests,
      totalTokens: row.totalTokens,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      estimatedCostUsd: row.estimatedCostUsd,
    };
  });

  const appKeys: AppKey[] = ["stocks", "disney", "costs", "council", "users"];
  const byApp = appKeys.map((app) => {
    const tokenRows = byFeature.filter((row) => row.app === app);
    const accessRow = byAppAccess.find((row) => row.app === app);
    return {
      app,
      label: APP_LABELS[app],
      tokenRequests: tokenRows.reduce((sum, row) => sum + row.requests, 0),
      totalTokens: tokenRows.reduce((sum, row) => sum + row.totalTokens, 0),
      estimatedCostUsd: tokenRows.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
      apiCalls: accessRow?.apiCalls ?? 0,
      avgDurationMs: accessRow?.avgDurationMs ?? 0,
    };
  });

  const dailyMap = new Map<string, { totalTokens: number; estimatedCostUsd: number; apiCalls: number }>();

  for (const point of dailyTokens) {
    dailyMap.set(point.date, {
      totalTokens: point.totalTokens,
      estimatedCostUsd: point.estimatedCostUsd,
      apiCalls: 0,
    });
  }

  for (const point of dailyAccess) {
    const existing = dailyMap.get(point.date) ?? {
      totalTokens: 0,
      estimatedCostUsd: 0,
      apiCalls: 0,
    };
    existing.apiCalls = point.apiCalls;
    dailyMap.set(point.date, existing);
  }

  const dailyUsage = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  return {
    month: monthParam(monthDate),
    monthLabel: monthLabel(monthDate),
    quota: {
      used,
      limit,
      remaining,
      percentUsed,
      estimatedCostUsd,
    },
    byFeature,
    byApp,
    dailyUsage,
    recentTokens,
    recentAccess,
    azureInfra,
  };
}
