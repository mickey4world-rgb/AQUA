/**
 * WORKS ニュースサーチ用・複数ソース RSS 収集
 * Google News / Bing News / 公的・専門フィードを併用。
 * 主フィード不足時は同意図の緊急ライブフィードで補完（学習データ捏造は禁止）。
 */
import { parseStringPromise } from "xml2js";
import type { NewsSearchCategory } from "@/lib/types/works-news-search";

export type RawNewsSeed = {
  category: NewsSearchCategory;
  title: string;
  summary: string;
  sourceUrl?: string;
  sourceName: string;
  publishedAt?: string;
  feedWeight: number;
};

const FEED_TIMEOUT_MS = 12_000;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MIN_SEEDS_BEFORE_FALLBACK = 3;

type FeedDef = {
  category: NewsSearchCategory;
  url: string;
  sourceName: string;
  weight: number;
};

const FEEDS: readonly FeedDef[] = [
  {
    category: "ai",
    url: "https://news.google.com/rss/search?q=AI+OR+%E4%BA%BA%E5%B7%A5%E7%9F%A5%E8%83%BD+OR+ChatGPT+OR+Gemini+when:1d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News",
    weight: 1.2,
  },
  {
    category: "ai",
    url: "https://www.bing.com/news/search?q=artificial+intelligence+OR+AI&format=rss",
    sourceName: "Bing News",
    weight: 1.1,
  },
  {
    category: "ai",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    sourceName: "Ars Technica",
    weight: 1.0,
  },
  {
    category: "ai",
    url: "https://www.technologyreview.com/feed/",
    sourceName: "MIT Tech Review",
    weight: 1.05,
  },
  {
    category: "systems",
    url: "https://news.google.com/rss/search?q=クラウド+OR+Azure+OR+AWS+OR+Kubernetes+OR+%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E9%96%8B%E7%99%BA+when:1d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News",
    weight: 1.2,
  },
  {
    category: "systems",
    url: "https://www.bing.com/news/search?q=cloud+OR+Azure+OR+software+engineering&format=rss",
    sourceName: "Bing News",
    weight: 1.1,
  },
  {
    category: "systems",
    url: "https://www.infoq.com/feed/",
    sourceName: "InfoQ",
    weight: 1.0,
  },
  {
    category: "systems",
    url: "https://devblogs.microsoft.com/feed/",
    sourceName: "Microsoft DevBlogs",
    weight: 1.05,
  },
  {
    category: "economy",
    url: "https://news.google.com/rss/search?q=%E4%B8%96%E7%95%8C%E7%B5%8C%E6%B8%88+OR+%E7%B1%B3%E5%9B%BD%E7%B5%8C%E6%B8%88+OR+%E6%97%A5%E6%9C%AC%E7%B5%8C%E6%B8%88+when:1d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News",
    weight: 1.2,
  },
  {
    category: "economy",
    url: "https://www.bing.com/news/search?q=world+economy+OR+markets&format=rss",
    sourceName: "Bing News",
    weight: 1.1,
  },
  {
    category: "economy",
    url: "https://www.nhk.or.jp/rss/news/cat6.xml",
    sourceName: "NHK 経済",
    weight: 1.15,
  },
  {
    category: "economy",
    url: "https://feeds.reuters.com/reuters/businessNews",
    sourceName: "Reuters",
    weight: 1.1,
  },
  {
    category: "government",
    url: "https://news.google.com/rss/search?q=%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E5%BA%81+OR+%E5%AE%98%E5%85%AC%E5%BA%81+OR+%E6%94%BF%E5%BA%9C+AI+OR+%E8%A1%8C%E6%94%BF%E4%BA%8B%E6%A5%AD+when:2d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News",
    weight: 1.25,
  },
  {
    category: "government",
    url: "https://www.bing.com/news/search?q=%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E5%BA%81+OR+%E5%AE%98%E5%85%AC%E5%BA%81&format=rss",
    sourceName: "Bing News",
    weight: 1.1,
  },
  {
    category: "government",
    url: "https://www.digital.go.jp/news.rss",
    sourceName: "デジタル庁",
    weight: 1.3,
  },
  {
    category: "government",
    url: "https://www.soumu.go.jp/menu_news/s-news/index.rss",
    sourceName: "総務省",
    weight: 1.2,
  },
];

/** 主フィードが薄い／全滅したときの同意図ライブ代替 */
const FALLBACK_FEEDS: readonly FeedDef[] = [
  {
    category: "ai",
    url: "https://news.google.com/rss/search?q=AI+OR+ChatGPT+OR+Gemini+OR+%E4%BA%BA%E5%B7%A5%E7%9F%A5%E8%83%BD+when:3d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News (3d)",
    weight: 1.0,
  },
  {
    category: "ai",
    url: "https://news.yahoo.co.jp/rss/topics/it.xml",
    sourceName: "Yahoo! ニュース IT",
    weight: 0.95,
  },
  {
    category: "systems",
    url: "https://news.google.com/rss/search?q=クラウド+OR+Azure+OR+AWS+OR+DevOps+when:3d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News (3d)",
    weight: 1.0,
  },
  {
    category: "systems",
    url: "https://www.publickey1.jp/atom.xml",
    sourceName: "Publickey",
    weight: 1.05,
  },
  {
    category: "economy",
    url: "https://news.google.com/rss/search?q=%E7%B5%8C%E6%B8%88+OR+%E5%B8%82%E5%A0%B4+OR+FRB+when:3d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News (3d)",
    weight: 1.0,
  },
  {
    category: "economy",
    url: "https://www.nhk.or.jp/rss/news/cat0.xml",
    sourceName: "NHK 主要",
    weight: 1.05,
  },
  {
    category: "government",
    url: "https://news.google.com/rss/search?q=%E6%94%BF%E5%BA%9C+OR+%E5%AE%98%E5%85%AC%E5%BA%81+OR+%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E5%BA%81+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News (7d)",
    weight: 1.0,
  },
  {
    category: "government",
    url: "https://www.digital.go.jp/news.rss",
    sourceName: "デジタル庁 (retry)",
    weight: 1.2,
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

function isFresh(publishedAt: string | undefined, now: number): boolean {
  if (!publishedAt) return true;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t <= MAX_AGE_MS;
}

async function fetchFeedItems(feedUrl: string): Promise<
  Array<{ title: string; summary: string; link: string; publishedAt?: string }>
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "AquaWorksNewsSearch/1.0 (+https://www.aquacore.net)" },
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

    return rawItems.slice(0, 12).map((item: Record<string, unknown>) => {
      const title = stripHtml(textOf(item.title)).slice(0, 160);
      const desc = stripHtml(
        textOf(item.description) || textOf(item.summary) || textOf(item.content),
      ).slice(0, 280);
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

async function collectFromFeedList(
  feeds: readonly FeedDef[],
  now: number,
): Promise<{ seeds: RawNewsSeed[]; errors: string[] }> {
  const seeds: RawNewsSeed[] = [];
  const errors: string[] = [];
  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const rows = await fetchFeedItems(feed.url);
        for (const row of rows) {
          if (!row.title) continue;
          if (!isFresh(row.publishedAt, now)) continue;
          seeds.push({
            category: feed.category,
            title: row.title,
            summary: row.summary.slice(0, 200) || row.title,
            sourceUrl: row.link.startsWith("http") ? row.link : undefined,
            sourceName: feed.sourceName,
            publishedAt: row.publishedAt,
            feedWeight: feed.weight,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${feed.sourceName} (${feed.category}): ${msg}`);
      }
    }),
  );
  return { seeds, errors };
}

/** カテゴリ横断で生ニュースを収集（不足カテゴリは緊急フィードで補完） */
export async function collectMultiSourceNewsSeeds(): Promise<{
  seeds: RawNewsSeed[];
  errors: string[];
  usedFallback: boolean;
}> {
  const now = Date.now();
  const primary = await collectFromFeedList(FEEDS, now);
  const seeds = [...primary.seeds];
  const errors = [...primary.errors];
  let usedFallback = false;

  const categories: NewsSearchCategory[] = ["ai", "systems", "economy", "government"];
  const thin = categories.filter(
    (c) => seeds.filter((s) => s.category === c).length < MIN_SEEDS_BEFORE_FALLBACK,
  );
  if (thin.length > 0 || seeds.length === 0) {
    const fallbackFeeds =
      seeds.length === 0
        ? FALLBACK_FEEDS
        : FALLBACK_FEEDS.filter((f) => thin.includes(f.category));
    const secondary = await collectFromFeedList(fallbackFeeds, now);
    if (secondary.seeds.length > 0) usedFallback = true;
    seeds.push(...secondary.seeds);
    errors.push(...secondary.errors.map((e) => `fallback: ${e}`));
  }

  return { seeds, errors, usedFallback };
}

/** 注目度の粗いヒューリスティック（後段で LLM が再採点） */
export function scoreAttentionSeed(seed: RawNewsSeed, now = Date.now()): number {
  let score = 45 * seed.feedWeight;
  if (seed.publishedAt) {
    const ageH = (now - new Date(seed.publishedAt).getTime()) / 3_600_000;
    if (ageH < 6) score += 25;
    else if (ageH < 24) score += 15;
    else if (ageH < 48) score += 8;
  } else {
    score += 5;
  }
  const blob = `${seed.title} ${seed.summary}`.toLowerCase();
  const boosts = [
    "ai",
    "人工知能",
    "クラウド",
    "azure",
    "政府",
    "デジタル庁",
    "規制",
    "予算",
    "セキュリティ",
    "基盤",
  ];
  for (const word of boosts) {
    if (blob.includes(word)) score += 3;
  }
  return Math.max(1, Math.min(99, Math.round(score)));
}
