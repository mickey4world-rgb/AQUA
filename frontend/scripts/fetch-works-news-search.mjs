/**
 * WORKS ニュースサーチ（GHA）
 * SWA 時間制限を避け、RSS を Actions 上で集約 → API ingest。
 * 深堀解説は ingest 後に API rebuild を試行（失敗しても RSS ダイジェストは残す）。
 */
import { createHash } from "crypto";
import { parseStringPromise } from "xml2js";

const cronSecret =
  process.env.SOLUNA_CRON_SECRET?.trim() || process.env.WORKS_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(
  /\/$/,
  "",
);
const force = process.argv.includes("--force");

if (!cronSecret) {
  console.error("SOLUNA_CRON_SECRET（または WORKS_CRON_SECRET）が必要です。");
  process.exit(1);
}

const CATEGORIES = ["ai", "systems", "economy", "government"];
const LABELS = {
  ai: "AI ニュース",
  systems: "システム開発",
  economy: "世界経済",
  government: "官公庁",
};

const FEEDS = [
  {
    category: "ai",
    url: "https://news.google.com/rss/search?q=AI+OR+%E4%BA%BA%E5%B7%A5%E7%9F%A5%E8%83%BD+when:1d&hl=ja&gl=JP&ceid=JP:ja",
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
    category: "systems",
    url: "https://news.google.com/rss/search?q=クラウド+OR+Azure+OR+Kubernetes+OR+%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E9%96%8B%E7%99%BA+when:1d&hl=ja&gl=JP&ceid=JP:ja",
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
    url: "https://devblogs.microsoft.com/feed/",
    sourceName: "Microsoft DevBlogs",
    weight: 1.05,
  },
  {
    category: "economy",
    url: "https://news.google.com/rss/search?q=%E4%B8%96%E7%95%8C%E7%B5%8C%E6%B8%88+OR+%E6%97%A5%E6%9C%AC%E7%B5%8C%E6%B8%88+when:1d&hl=ja&gl=JP&ceid=JP:ja",
    sourceName: "Google News",
    weight: 1.2,
  },
  {
    category: "economy",
    url: "https://www.nhk.or.jp/rss/news/cat6.xml",
    sourceName: "NHK 経済",
    weight: 1.15,
  },
  {
    category: "systems",
    url: "https://www.infoq.com/feed/",
    sourceName: "InfoQ",
    weight: 1.0,
  },
  {
    category: "systems",
    url: "https://www.publickey1.jp/atom.xml",
    sourceName: "Publickey",
    weight: 1.1,
  },
  {
    category: "economy",
    url: "https://www.bing.com/news/search?q=world+economy+OR+markets&format=rss",
    sourceName: "Bing News",
    weight: 1.1,
  },
  {
    category: "government",
    url: "https://news.google.com/rss/search?q=%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E5%BA%81+OR+%E5%AE%98%E5%85%AC%E5%BA%81+OR+%E6%94%BF%E5%BA%9C+AI+when:2d&hl=ja&gl=JP&ceid=JP:ja",
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
    url: "https://www.nikkei.com/rss/news/politics.rdf",
    sourceName: "Nikkei Politics",
    weight: 1.1,
  },
  {
    category: "government",
    url: "https://www.nhk.or.jp/rss/news/cat0.xml",
    sourceName: "NHK 主要",
    weight: 1.15,
  },
];

function jstDateString(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function textOf(node) {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    if (typeof node._ === "string") return node._;
    if (typeof node["#text"] === "string") return node["#text"];
  }
  return "";
}

function linkOf(node) {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const href = node.$?.href;
    if (typeof href === "string") return href;
    if (typeof node._ === "string") return node._;
  }
  return "";
}

function stableId(category, title, sourceUrl) {
  return createHash("sha1")
    .update(`${category}|${sourceUrl || title}`)
    .digest("hex")
    .slice(0, 16);
}

function scoreAttention(seed, now = Date.now()) {
  let score = 45 * seed.weight;
  if (seed.publishedAt) {
    const ageH = (now - new Date(seed.publishedAt).getTime()) / 3_600_000;
    if (ageH < 6) score += 25;
    else if (ageH < 24) score += 15;
    else if (ageH < 48) score += 8;
  }
  const blob = `${seed.title} ${seed.summary}`.toLowerCase();
  for (const word of ["ai", "人工知能", "クラウド", "azure", "政府", "デジタル庁", "基盤"]) {
    if (blob.includes(word)) score += 3;
  }
  return Math.max(1, Math.min(99, Math.round(score)));
}

async function fetchFeedItems(feedUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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
    return rawItems.slice(0, 12).map((item) => {
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

async function collectSeeds() {
  const now = Date.now();
  const maxAge = 3 * 24 * 60 * 60 * 1000;
  const seeds = [];
  const errors = [];
  for (const feed of FEEDS) {
    try {
      const rows = await fetchFeedItems(feed.url);
      for (const row of rows) {
        if (!row.title) continue;
        if (row.publishedAt) {
          const t = new Date(row.publishedAt).getTime();
          if (!Number.isNaN(t) && now - t > maxAge) continue;
        }
        seeds.push({
          category: feed.category,
          title: row.title,
          summary: row.summary.slice(0, 200) || row.title,
          sourceUrl: row.link.startsWith("http") ? row.link : undefined,
          sourceName: feed.sourceName,
          publishedAt: row.publishedAt,
          weight: feed.weight,
        });
      }
      console.log(`[works-news] RSS OK ${feed.sourceName}/${feed.category}: ${rows.length}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
      console.warn(`[works-news] RSS fail ${feed.url}:`, msg);
    }
  }
  return { seeds, errors };
}

function buildDigest(seeds) {
  const seen = new Set();
  const unique = [];
  for (const seed of seeds) {
    const key = `${seed.category}:${(seed.sourceUrl || seed.title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(seed);
  }

  const categories = { ai: [], systems: [], economy: [], government: [] };
  for (const category of CATEGORIES) {
    categories[category] = unique
      .filter((s) => s.category === category)
      .map((s) => ({ seed: s, score: scoreAttention(s) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ seed, score }) => ({
        id: stableId(seed.category, seed.title, seed.sourceUrl),
        category: seed.category,
        title: seed.title,
        summary: seed.summary,
        deepDive: seed.summary,
        outlook: "今夜の解説生成で見通しを補完します（「今すぐ再取得」で詳細化可能）。",
        explanation: seed.summary,
        govRelevance:
          "司法クラウド基盤・政府事業管理AIの観点では、一次情報の確認と影響範囲の洗い出しから。",
        sources: seed.sourceUrl
          ? [{ name: seed.sourceName, url: seed.sourceUrl }]
          : [{ name: seed.sourceName, url: "" }],
        attentionScore: score,
        publishedAt: seed.publishedAt,
      }));
  }

  const total = CATEGORIES.reduce((sum, c) => sum + categories[c].length, 0);
  if (total === 0) throw new Error("RSS からニュースを取得できませんでした。");

  return {
    id: `works-news-search-${jstDateString()}`,
    fetchedAt: new Date().toISOString(),
    source: "rss",
    categories,
    solunaSynced: false,
    summary: CATEGORIES.map((c) => `${LABELS[c]}: ${categories[c][0]?.title ?? "—"}`).join(
      " / ",
    ),
  };
}

async function ingest(digest) {
  const response = await fetch(`${baseUrl}/api/works/news-search/cron`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ step: "ingest", digest, force }),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 400) };
  }
  console.log(JSON.stringify(payload, null, 2));
  console.log(`ingest HTTP ${response.status}`);
  if (!response.ok || payload.ok !== true) {
    throw new Error(`ingest failed HTTP ${response.status}`);
  }
  return payload;
}

const { seeds, errors } = await collectSeeds();
console.log(`[works-news] seeds=${seeds.length} errors=${errors.length}`);
const digest = buildDigest(seeds);
for (const key of CATEGORIES) {
  console.log(`[works-news] ${key}=${digest.categories[key].length}`);
}
await ingest(digest);
console.log("[works-news] ingest ok", digest.id);
