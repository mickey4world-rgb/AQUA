import { parseUserAgent } from "@/lib/client-hints";
import { PAGE_GROUP_LABELS, publicPageGroup, publicPageLabel } from "@/lib/public-pages";
import {
  listPageViewsInRange,
  maskVisitorKey,
} from "@/lib/server/page-view-log";
import {
  monthEndIso,
  monthStartIso,
  parseMonthParam,
} from "@/lib/server/token-usage";
import type {
  PublicAccessAnalyticsBucketRow,
  PublicAccessAnalyticsReport,
} from "@/lib/types/analytics";
import type { PageViewLog } from "@/lib/types/page-view-log";

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

function pageKey(view: PageViewLog): string {
  return view.section ? `${view.pathname}#${view.section}` : view.pathname;
}

function accumulateBucket(
  map: Map<string, { pageViews: number; visitors: Set<string> }>,
  key: string,
  visitorKey: string,
) {
  const entry = map.get(key) ?? { pageViews: 0, visitors: new Set<string>() };
  entry.pageViews += 1;
  entry.visitors.add(visitorKey);
  map.set(key, entry);
}

function toBucketRows(
  map: Map<string, { pageViews: number; visitors: Set<string> }>,
  labelOf?: (key: string) => string,
  limit = 12,
): PublicAccessAnalyticsBucketRow[] {
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: labelOf ? labelOf(key) : key,
      pageViews: value.pageViews,
      uniqueVisitors: value.visitors.size,
    }))
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, limit);
}

function resolveBrowser(view: PageViewLog): string {
  return view.browser || parseUserAgent(view.userAgent).browser;
}

function resolveOs(view: PageViewLog): string {
  return view.os || parseUserAgent(view.userAgent).os;
}

function resolveDevice(view: PageViewLog): string {
  return view.deviceType || parseUserAgent(view.userAgent).deviceType;
}

export async function buildPublicAccessAnalyticsReport(
  month?: string | null,
): Promise<PublicAccessAnalyticsReport> {
  const monthDate = parseMonthParam(month);
  const start = monthStartIso(monthDate);
  const end = monthEndIso(monthDate);

  const views = await listPageViewsInRange(start, end, 8000);

  const byPageMap = new Map<
    string,
    {
      pathname: string;
      section: string | null;
      pageLabel: string;
      pageGroup: string;
      pageViews: number;
      visitors: Set<string>;
    }
  >();
  const byGroup = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byDay = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byReferrer = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byBrowser = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byOs = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byDevice = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byCountry = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byLanguage = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const byTimezone = new Map<string, { pageViews: number; visitors: Set<string> }>();
  const globalVisitors = new Set<string>();

  for (const view of views) {
    globalVisitors.add(view.visitorKey);
    const section = view.section ?? null;
    const group = view.pageGroup || publicPageGroup(view.pathname, section);
    const label = view.pageLabel || publicPageLabel(view.pathname, section);
    const key = pageKey(view);

    const pageEntry = byPageMap.get(key) ?? {
      pathname: view.pathname,
      section,
      pageLabel: label,
      pageGroup: group,
      pageViews: 0,
      visitors: new Set<string>(),
    };
    pageEntry.pageViews += 1;
    pageEntry.visitors.add(view.visitorKey);
    byPageMap.set(key, pageEntry);

    accumulateBucket(byGroup, group, view.visitorKey);
    accumulateBucket(byDay, view.createdAt.slice(0, 10), view.visitorKey);
    accumulateBucket(byReferrer, normalizeReferrer(view.referrer), view.visitorKey);
    accumulateBucket(byBrowser, resolveBrowser(view), view.visitorKey);
    accumulateBucket(byOs, resolveOs(view), view.visitorKey);
    accumulateBucket(byDevice, resolveDevice(view), view.visitorKey);
    accumulateBucket(byCountry, view.country || "不明", view.visitorKey);
    accumulateBucket(byLanguage, view.language || "不明", view.visitorKey);
    accumulateBucket(byTimezone, view.timezone || "不明", view.visitorKey);
  }

  const byPage = [...byPageMap.values()]
    .map((row) => ({
      pathname: row.pathname,
      pageLabel: row.pageLabel,
      pageGroup: row.pageGroup,
      pageGroupLabel: PAGE_GROUP_LABELS[row.pageGroup] ?? row.pageGroup,
      section: row.section,
      pageViews: row.pageViews,
      uniqueVisitors: row.visitors.size,
    }))
    .sort((a, b) => b.pageViews - a.pageViews);

  const totalPageViews = views.length;

  return {
    month: monthParam(monthDate),
    monthLabel: monthLabel(monthDate),
    configured: true,
    summary: {
      pageViews: totalPageViews,
      uniqueVisitors: globalVisitors.size,
      uniquePages: byPage.length,
      pageViewsIncludingRepeats: totalPageViews,
      uniqueVisitorsExcludingRepeats: globalVisitors.size,
    },
    byPage,
    byGroup: toBucketRows(byGroup, (key) => PAGE_GROUP_LABELS[key] ?? key, 10),
    byDay: [...byDay.entries()]
      .map(([date, value]) => ({
        date,
        pageViews: value.pageViews,
        uniqueVisitors: value.visitors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byReferrer: toBucketRows(byReferrer).map((row) => ({
      referrer: row.label,
      count: row.pageViews,
    })),
    byBrowser: toBucketRows(byBrowser),
    byOs: toBucketRows(byOs),
    byDevice: toBucketRows(byDevice),
    byCountry: toBucketRows(byCountry),
    byLanguage: toBucketRows(byLanguage),
    byTimezone: toBucketRows(byTimezone),
    recentViews: views.slice(0, 100).map((view) => {
      const ua = parseUserAgent(view.userAgent);
      return {
        id: view.id,
        pathname: view.pathname,
        pageLabel: view.pageLabel || publicPageLabel(view.pathname, view.section),
        pageGroup: view.pageGroup || publicPageGroup(view.pathname, view.section),
        section: view.section,
        visitorMask: maskVisitorKey(view.visitorKey),
        referrer: normalizeReferrer(view.referrer),
        device: view.deviceType || ua.deviceType,
        browser: view.browser || ua.browser,
        os: view.os || ua.os,
        language: view.language || "—",
        timezone: view.timezone || "—",
        screen: view.screen || "—",
        country: view.country || "—",
        region: view.region || "—",
        city: view.city || "—",
        createdAt: view.createdAt,
      };
    }),
    notes: [
      "PV = 同一訪問者を含むアクセス回数。UU = 端末ローカル UUID ベースのユニーク訪問者。",
      "国・都市は CDN / エッジが付与するヘッダーがある場合のみ取得（Azure SWA 単体では空のことがあります）。",
      "ブラウザ・OS・画面・タイムゾーン・言語は User-Agent とクライアントヒントから推定します。",
      "SHOWCASE 詳細はセクション表示時に計測（サンキー／訴訟／合議／株／ディズニー／小惑星／Soluna）。",
    ],
  };
}
