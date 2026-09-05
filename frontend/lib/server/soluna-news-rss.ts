/**
 * 公開 RSS から直近ニュースを取得（Gemini 非 grounding の代替）
 * 学習データの古い関税・AI話を討伐ネタにしないための鮮度担保。
 */
import { parseStringPromise } from "xml2js";

export type RssNewsSeed = {
  title: string;
  summary: string;
  sourceUrl?: string;
  keyword: string;
  publishedAt?: string;
};

const MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const FEED_TIMEOUT_MS = 12_000;

const RSS_FEEDS: ReadonlyArray<{ url: string; keyword: string }> = [
  // AI（直近）
  {
    url: "https://news.google.com/rss/search?q=AI+OR+%E4%BA%BA%E5%B7%A5%E7%9F%A5%E8%83%BD+when:2d&hl=ja&gl=JP&ceid=JP:ja",
    keyword: "AI 最新動向",
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    keyword: "AI 最新動向",
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    keyword: "AI 最新動向",
  },
  // 経済（直近）
  {
    url: "https://news.google.com/rss/search?q=%E4%B8%96%E7%95%8C%E7%B5%8C%E6%B8%88+OR+%E7%B1%B3%E5%9B%BD%E7%B5%8C%E6%B8%88+OR+%E6%97%A5%E6%9C%AC%E7%B5%8C%E6%B8%88+when:2d&hl=ja&gl=JP&ceid=JP:ja",
    keyword: "世界経済",
  },
  {
    url: "https://www.nhk.or.jp/rss/news/cat6.xml",
    keyword: "世界経済",
  },
  {
    url: "https://feeds.reuters.com/reuters/businessNews",
    keyword: "世界経済",
  },
];

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj._ === "string") return obj._;
    if (typeof obj["#text"] === "string") return obj["#text"];
  }
  return "";
}

function linkOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const href = (obj.$ as { href?: string } | undefined)?.href;
    if (typeof href === "string") return href;
    if (typeof obj._ === "string") return obj._;
  }
  return "";
}

async function fetchFeedItems(
  feedUrl: string,
): Promise<Array<{ title: string; summary: string; link: string; publishedAt?: string }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "SolunaNewsBot/1.1 (+https://www.aquacore.net)" },
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const channel = parsed?.rss?.channel ?? parsed?.feed;
    if (!channel) return [];

    const rawItems = Array.isArray(channel.item)
      ? channel.item
      : channel.item
        ? [channel.item]
        : Array.isArray(channel.entry)
          ? channel.entry
          : channel.entry
            ? [channel.entry]
            : [];

    return rawItems.slice(0, 8).map((item: Record<string, unknown>) => {
      const title = stripHtml(textOf(item.title)).slice(0, 120);
      const desc = stripHtml(
        textOf(item.description) || textOf(item.summary) || textOf(item.content),
      ).slice(0, 200);
      const link = linkOf(item.link) || textOf(item.guid);
      const published =
        parseDate(item.pubDate) ||
        parseDate(item.published) ||
        parseDate(item.updated) ||
        parseDate(item["dc:date"]);
      return {
        title,
        summary: desc || title,
        link: typeof link === "string" ? link : "",
        publishedAt: published ? published.toISOString() : undefined,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isFresh(publishedAt: string | undefined, now: number): boolean {
  if (!publishedAt) return true; // 日付不明は候補に残し、後段で新しい順を優先
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t <= MAX_AGE_MS;
}

/**
 * キーワード別に直近 RSS 記事を最大 perKeyword 件返す。
 */
export async function fetchFreshNewsFromRss(options?: {
  keywords?: readonly string[];
  perKeyword?: number;
}): Promise<{ items: RssNewsSeed[]; summary: string; errors: string[] }> {
  const keywords = options?.keywords?.length
    ? [...options.keywords]
    : ["AI 最新動向", "世界経済"];
  const perKeyword = options?.perKeyword ?? 2;
  const now = Date.now();
  const bucket = new Map<string, RssNewsSeed[]>();
  for (const keyword of keywords) bucket.set(keyword, []);
  const errors: string[] = [];

  const feeds = RSS_FEEDS.filter((feed) => keywords.includes(feed.keyword));
  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const rows = await fetchFeedItems(feed.url);
        const list = bucket.get(feed.keyword) ?? [];
        for (const row of rows) {
          if (!row.title) continue;
          if (!isFresh(row.publishedAt, now)) continue;
          list.push({
            title: row.title,
            summary: row.summary.slice(0, 120) || row.title,
            sourceUrl: row.link.startsWith("http") ? row.link : undefined,
            keyword: feed.keyword,
            publishedAt: row.publishedAt,
          });
        }
        bucket.set(feed.keyword, list);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${feed.url}: ${msg}`);
      }
    }),
  );

  const items: RssNewsSeed[] = [];
  for (const keyword of keywords) {
    const list = (bucket.get(keyword) ?? [])
      .sort((a, b) => {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return tb - ta;
      })
      .filter((item, index, arr) => {
        const key = item.title.toLowerCase();
        return arr.findIndex((x) => x.title.toLowerCase() === key) === index;
      })
      .slice(0, perKeyword);
    items.push(...list);
  }

  if (items.length === 0) {
    throw new Error(
      `RSS から直近ニュースを取得できませんでした: ${errors.slice(0, 2).join(" / ") || "empty"}`,
    );
  }

  return {
    items,
    summary: items.map((item) => item.title).join(" / ").slice(0, 220),
    errors,
  };
}
