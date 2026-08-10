import {
  getDailyPageViewCounts,
  getDailyPageViewVisitorKeys,
  getPageViewStatsByPath,
  getPageViewVisitorRows,
  getReferrerStats,
  listRecentPageViews,
  maskVisitorKey,
} from "@/lib/server/page-view-log";
import { publicPageLabel } from "@/lib/public-pages";
import {
  monthEndIso,
  monthStartIso,
  parseMonthParam,
} from "@/lib/server/token-usage";
import type { PublicAccessAnalyticsReport } from "@/lib/types/analytics";

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

function normalizeReferrer(referrer: string | null): string {
  if (!referrer) return "直接アクセス";
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "") || "直接アクセス";
  } catch {
    return referrer.slice(0, 80);
  }
}

function simplifyUserAgent(userAgent: string | null): string {
  if (!userAgent) return "不明";
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Chrome/i.test(userAgent)) return "Chrome";
  if (/Safari/i.test(userAgent)) return "Safari";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  return "その他";
}

export async function buildPublicAccessAnalyticsReport(
  month?: string | null,
): Promise<PublicAccessAnalyticsReport> {
  const monthDate = parseMonthParam(month);
  const start = monthStartIso(monthDate);
  const end = monthEndIso(monthDate);

  const [byPathRaw, visitorRows, dailyRaw, dailyVisitorKeys, referrerRaw, recentRaw] =
    await Promise.all([
      getPageViewStatsByPath(start, end),
      getPageViewVisitorRows(start, end),
      getDailyPageViewCounts(start, end),
      getDailyPageViewVisitorKeys(start, end),
      getReferrerStats(start, end),
      listRecentPageViews(start, end, 80),
    ]);

  const uniqueByPath = new Map<string, Set<string>>();
  const globalVisitors = new Set<string>();

  for (const row of visitorRows) {
    globalVisitors.add(row.visitorKey);
    const set = uniqueByPath.get(row.pathname) ?? new Set<string>();
    set.add(row.visitorKey);
    uniqueByPath.set(row.pathname, set);
  }

  const dailyUnique = new Map<string, Set<string>>();
  for (const row of dailyVisitorKeys) {
    const set = dailyUnique.get(row.date) ?? new Set<string>();
    set.add(row.visitorKey);
    dailyUnique.set(row.date, set);
  }

  const byPage = byPathRaw
    .map((row) => ({
      pathname: row.pathname,
      pageLabel: row.pageLabel || publicPageLabel(row.pathname),
      pageViews: row.pageViews ?? 0,
      uniqueVisitors: uniqueByPath.get(row.pathname)?.size ?? 0,
    }))
    .sort((a, b) => b.pageViews - a.pageViews);

  const byDay = dailyRaw
    .map((row) => ({
      date: row.date,
      pageViews: row.pageViews ?? 0,
      uniqueVisitors: dailyUnique.get(row.date)?.size ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalPageViews = byPage.reduce((sum, row) => sum + row.pageViews, 0);

  return {
    month: monthParam(monthDate),
    monthLabel: monthLabel(monthDate),
    configured: true,
    summary: {
      pageViews: totalPageViews,
      uniqueVisitors: globalVisitors.size,
      uniquePages: byPage.length,
    },
    byPage,
    byDay,
    byReferrer: referrerRaw
      .map((row) => ({
        referrer: normalizeReferrer(row.referrer),
        count: row.count ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    recentViews: recentRaw.map((view) => ({
      id: view.id,
      pathname: view.pathname,
      pageLabel: view.pageLabel,
      visitorMask: maskVisitorKey(view.visitorKey),
      referrer: normalizeReferrer(view.referrer),
      device: simplifyUserAgent(view.userAgent),
      createdAt: view.createdAt,
    })),
  };
}
