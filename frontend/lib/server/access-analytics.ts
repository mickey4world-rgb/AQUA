import { APP_LABELS, featureLabel } from "@/lib/analytics-constants";
import {
  getAccessStatsByUserAndFeature,
  listAccessLogsInRange,
  listRecentAccessLogsAllUsers,
} from "@/lib/server/access-log";
import { listAllUsers } from "@/lib/server/users";
import {
  monthEndIso,
  monthStartIso,
  parseMonthParam,
} from "@/lib/server/token-usage";
import { buildSecurityAnalyticsReport } from "@/lib/server/security-analytics";
import type { AppKey } from "@/lib/types/access-log";
import type { AccessAnalyticsReport } from "@/lib/types/analytics";
import type { User } from "@/lib/types/user";

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

function resolveUserLabel(userId: string, usersById: Map<string, User>): string {
  const user = usersById.get(userId);
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split("@")[0];
  if (userId.includes("@")) return userId.split("@")[0];
  return userId.length > 24 ? `${userId.slice(0, 22)}…` : userId;
}

function resolveUserEmail(userId: string, usersById: Map<string, User>): string {
  const user = usersById.get(userId);
  return user?.email ?? (userId.includes("@") ? userId : "—");
}

export async function buildAccessAnalyticsReport(
  month?: string | null,
): Promise<AccessAnalyticsReport> {
  const monthDate = parseMonthParam(month);
  const start = monthStartIso(monthDate);
  const end = monthEndIso(monthDate);

  const [rows, recentAccess, users, monthLogs, security] = await Promise.all([
    getAccessStatsByUserAndFeature(start, end),
    listRecentAccessLogsAllUsers(start, end, 80),
    listAllUsers(),
    listAccessLogsInRange(start, end, 8000),
    buildSecurityAnalyticsReport(monthParam(monthDate)),
  ]);

  const usersById = new Map(users.map((user) => [user.userId, user]));

  const byDayMap = new Map<string, { apiCalls: number; users: Set<string> }>();
  const byAppMap = new Map<string, { apiCalls: number; users: Set<string> }>();
  for (const log of monthLogs) {
    const day = log.createdAt.slice(0, 10);
    const dayEntry = byDayMap.get(day) ?? { apiCalls: 0, users: new Set<string>() };
    dayEntry.apiCalls += 1;
    dayEntry.users.add(log.userId);
    byDayMap.set(day, dayEntry);

    const appEntry = byAppMap.get(log.app) ?? { apiCalls: 0, users: new Set<string>() };
    appEntry.apiCalls += 1;
    appEntry.users.add(log.userId);
    byAppMap.set(log.app, appEntry);
  }

  const byUserMap = new Map<
    string,
    {
      apiCalls: number;
      apps: Set<AppKey>;
      topFeature: { feature: string; app: AppKey; apiCalls: number };
      lastAccessAt: string;
    }
  >();

  const byPageMap = new Map<
    string,
    {
      app: AppKey;
      feature: string;
      apiCalls: number;
      users: Map<string, number>;
      lastAccessAt: string;
    }
  >();

  for (const row of rows) {
    const userEntry = byUserMap.get(row.userId) ?? {
      apiCalls: 0,
      apps: new Set<AppKey>(),
      topFeature: { feature: row.feature, app: row.app, apiCalls: 0 },
      lastAccessAt: row.lastAccessAt,
    };
    userEntry.apiCalls += row.apiCalls;
    userEntry.apps.add(row.app);
    if (row.apiCalls >= userEntry.topFeature.apiCalls) {
      userEntry.topFeature = {
        feature: row.feature,
        app: row.app,
        apiCalls: row.apiCalls,
      };
    }
    if (row.lastAccessAt > userEntry.lastAccessAt) {
      userEntry.lastAccessAt = row.lastAccessAt;
    }
    byUserMap.set(row.userId, userEntry);

    const pageKey = `${row.app}:${row.feature}`;
    const pageEntry = byPageMap.get(pageKey) ?? {
      app: row.app,
      feature: row.feature,
      apiCalls: 0,
      users: new Map<string, number>(),
      lastAccessAt: row.lastAccessAt,
    };
    pageEntry.apiCalls += row.apiCalls;
    pageEntry.users.set(row.userId, (pageEntry.users.get(row.userId) ?? 0) + row.apiCalls);
    if (row.lastAccessAt > pageEntry.lastAccessAt) {
      pageEntry.lastAccessAt = row.lastAccessAt;
    }
    byPageMap.set(pageKey, pageEntry);
  }

  const byUser = [...byUserMap.entries()]
    .map(([userId, stats]) => ({
      userId,
      displayName: resolveUserLabel(userId, usersById),
      email: resolveUserEmail(userId, usersById),
      apiCalls: stats.apiCalls,
      apps: [...stats.apps].sort(),
      appLabels: [...stats.apps].map((app) => APP_LABELS[app]),
      topFeature: stats.topFeature.feature,
      topFeatureLabel: `${APP_LABELS[stats.topFeature.app]} · ${featureLabel(stats.topFeature.feature)}`,
      lastAccessAt: stats.lastAccessAt,
    }))
    .sort((a, b) => b.apiCalls - a.apiCalls);

  const byPage = [...byPageMap.values()]
    .map((page) => ({
      app: page.app,
      appLabel: APP_LABELS[page.app],
      feature: page.feature,
      featureLabel: featureLabel(page.feature),
      pageLabel: `${APP_LABELS[page.app]} · ${featureLabel(page.feature)}`,
      apiCalls: page.apiCalls,
      uniqueUsers: page.users.size,
      users: [...page.users.entries()]
        .map(([userId, apiCalls]) => ({
          userId,
          displayName: resolveUserLabel(userId, usersById),
          apiCalls,
        }))
        .sort((a, b) => b.apiCalls - a.apiCalls),
      lastAccessAt: page.lastAccessAt,
    }))
    .sort((a, b) => b.apiCalls - a.apiCalls);

  const byUserPage = rows
    .map((row) => ({
      userId: row.userId,
      displayName: resolveUserLabel(row.userId, usersById),
      app: row.app,
      appLabel: APP_LABELS[row.app],
      feature: row.feature,
      featureLabel: featureLabel(row.feature),
      pageLabel: `${APP_LABELS[row.app]} · ${featureLabel(row.feature)}`,
      apiCalls: row.apiCalls,
      avgDurationMs: row.avgDurationMs,
      lastAccessAt: row.lastAccessAt,
    }))
    .sort((a, b) => b.apiCalls - a.apiCalls || b.lastAccessAt.localeCompare(a.lastAccessAt));

  const totalApiCalls = rows.reduce((sum, row) => sum + row.apiCalls, 0);

  return {
    month: monthParam(monthDate),
    monthLabel: monthLabel(monthDate),
    configured: true,
    summary: {
      totalApiCalls,
      uniqueUsers: byUserMap.size,
      uniquePages: byPageMap.size,
    },
    byUser,
    byPage,
    byUserPage,
    byDay: [...byDayMap.entries()]
      .map(([date, value]) => ({
        date,
        apiCalls: value.apiCalls,
        uniqueUsers: value.users.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byApp: [...byAppMap.entries()]
      .map(([app, value]) => ({
        app,
        appLabel: APP_LABELS[app as AppKey] ?? app,
        apiCalls: value.apiCalls,
        uniqueUsers: value.users.size,
      }))
      .sort((a, b) => b.apiCalls - a.apiCalls),
    recentAccess: recentAccess.map((row) => ({
      ...row,
      displayName: resolveUserLabel(row.userId, usersById),
      appLabel: APP_LABELS[row.app],
      featureLabel: featureLabel(row.feature),
      pageLabel: `${APP_LABELS[row.app]} · ${featureLabel(row.feature)}`,
    })),
    security,
  };
}
