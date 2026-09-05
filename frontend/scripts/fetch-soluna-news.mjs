/**
 * Soluna ニュース取得（GitHub Actions 用）
 * SWA の 45 秒制限を避け、Gemini Grounding を中継 Functions 経由で実行する。
 *
 * フォールバック順:
 *   1. Gemini Grounding（Google 検索付き）via relay
 *   2. RSS 直接取得（Google News when:2d / NHK / Reuters / Ars 等）
 *
 * 禁止: 非 grounding Gemini（学習データの古い関税・AI話が混入する）
 */

import { parseStringPromise } from "xml2js";

const KEYWORDS = ["AI 最新動向", "世界経済"];
const RELAY_TIMEOUT_MS = 110_000;
const MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

const RSS_FEEDS = [
  {
    url: "https://news.google.com/rss/search?q=AI+OR+%E4%BA%BA%E5%B7%A5%E7%9F%A5%E8%83%BD+when:2d&hl=ja&gl=JP&ceid=JP:ja",
    keyword: "AI 最新動向",
  },
  { url: "https://feeds.arstechnica.com/arstechnica/technology-lab", keyword: "AI 最新動向" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", keyword: "AI 最新動向" },
  {
    url: "https://news.google.com/rss/search?q=%E4%B8%96%E7%95%8C%E7%B5%8C%E6%B8%88+OR+%E7%B1%B3%E5%9B%BD%E7%B5%8C%E6%B8%88+OR+%E6%97%A5%E6%9C%AC%E7%B5%8C%E6%B8%88+when:2d&hl=ja&gl=JP&ceid=JP:ja",
    keyword: "世界経済",
  },
  { url: "https://feeds.reuters.com/reuters/businessNews", keyword: "世界経済" },
  { url: "https://www.nhk.or.jp/rss/news/cat6.xml", keyword: "世界経済" },
];

const SPECIES_POOL = ["dragon", "slime", "golem", "shadow", "chimera"];
const RANK_WORDS = [
  { words: ["AI", "人工知能", "規制", "reform", "crisis"], rank: 4 },
  { words: ["経済", "economy", "inflation", "インフレ", "GDP"], rank: 3 },
  { words: ["market", "株", "stock", "crypto", "仮想通貨"], rank: 3 },
  { words: ["war", "紛争", "conflict", "軍事"], rank: 5 },
  { words: ["climate", "気候", "energy", "エネルギー"], rank: 3 },
];
const MONSTER_PREFIX = ["暴走", "沈黙", "浮遊", "覚醒", "凍結", "制御不能"];
const MONSTER_SUFFIX = ["竜", "体", "塊", "影", "獣", "核"];

function deterministicMonsterName(title) {
  const hash = [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xfffffff, 0);
  const prefix = MONSTER_PREFIX[hash % MONSTER_PREFIX.length];
  const suffix = MONSTER_SUFFIX[Math.floor(hash / MONSTER_PREFIX.length) % MONSTER_SUFFIX.length];
  const abbrev = title.replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]/g, "").slice(0, 4) || "謎";
  return `${prefix}${abbrev}${suffix}`;
}

function deterministicRank(title) {
  const lower = title.toLowerCase();
  for (const { words, rank } of RANK_WORDS) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return rank;
  }
  return 2;
}

function deterministicSpecies(title) {
  const hash = [...title].reduce((h, c) => (h * 17 + c.charCodeAt(0)) & 0xfffffff, 0);
  return SPECIES_POOL[hash % SPECIES_POOL.length];
}

const relayUrl = process.env.GEMINI_RELAY_URL?.trim();
const relayKey = process.env.GEMINI_RELAY_KEY?.trim();
const cronSecret = process.env.SOLUNA_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(/\/$/, "");
const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

if (!cronSecret) {
  console.error("SOLUNA_CRON_SECRET が必要です。");
  process.exit(1);
}

function jstDateString(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function briefingDocIdForDate(date = new Date()) {
  return `briefing-${jstDateString(date)}`;
}

function stripJsonFence(text) {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced ? fenced[1] : text.trim();
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

function isFreshPublishedAt(value, now = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return true;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return true;
  return now - t <= MAX_AGE_MS;
}

function normalizeItems(raw, keywords) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return [];
  const allowed = new Set(keywords);
  const result = [];
  const now = Date.now();
  for (const item of raw.items.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    const keyword =
      typeof item.keyword === "string" && allowed.has(item.keyword) ? item.keyword : keywords[0];
    const sourceUrl =
      typeof item.sourceUrl === "string" && item.sourceUrl.startsWith("http")
        ? item.sourceUrl
        : undefined;
    const publishedAt =
      typeof item.publishedAt === "string" && item.publishedAt.trim()
        ? item.publishedAt.trim()
        : undefined;
    if (publishedAt && !isFreshPublishedAt(publishedAt, now)) continue;
    if (!title || !summary) continue;
    result.push({
      title,
      summary,
      keyword,
      sourceUrl,
      publishedAt,
      monsterName: typeof item.monsterName === "string" ? item.monsterName.trim() : undefined,
      rank: typeof item.rank === "number" ? item.rank : undefined,
      species: typeof item.species === "string" ? item.species : undefined,
    });
  }
  return result;
}

function itemsLookGrounded(items) {
  if (items.length === 0) return false;
  const withUrl = items.filter((item) => item.sourceUrl).length;
  return withUrl >= Math.ceil(items.length / 2);
}

function buildNewsPrompts() {
  const todayJst = jstDateString();
  const system = `あなたはニュースキュレーターです。Google 検索で「今日（JST ${todayJst}）」時点の最新報道だけを調べます。
学習データの記憶や半年前の話題の再利用は禁止。事実ベースで簡潔に。推測は summary に含めない。JSON のみ返してください。`;
  const userPrompt = `基準日（JST）: ${todayJst}
次のキーワードについて、直近48時間以内に新たに報じられた重要ニュースをそれぞれ1〜2件ずつ調べてください: ${KEYWORDS.join("、")}

厳守:
- 「懸念が続く」「依然として燻る」だけの背景説明は不可。誰が・何を・いつ発表／決定したかの新事実がある記事だけ。
- 各 item に実在する sourceUrl と publishedAt（ISO8601）を付ける。48時間より古い記事は出さない。
- 関税・貿易・AI でも古い出来事の再掲は禁止。今日〜一昨日の動きに限定。

各記事は討伐対象のモンスターとして命名する。monsterName はゲーム風だが元ニュースの意味が残ること。rank は 1〜5。species は dragon / slime / golem / shadow / chimera。

JSON 形式:
{
  "summary": "全体を2〜3文で要約（今日の新事実のみ）",
  "items": [
    {
      "keyword": "AI 最新動向",
      "title": "見出し",
      "summary": "80文字以内の要点",
      "sourceUrl": "https://...",
      "publishedAt": "${todayJst}T00:00:00+09:00",
      "monsterName": "暴走規制竜レギュラ",
      "species": "dragon",
      "rank": 4
    }
  ]
}`;
  return { system, userPrompt };
}

async function callRelay(modelName, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-functions-key": relayKey,
      },
      signal: controller.signal,
      body: JSON.stringify({ model: modelName, body }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `Gemini relay HTTP ${response.status}`);
    }
    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) {
      const finishReason = candidate?.finishReason ?? "unknown";
      throw new Error(`ニュース検索の結果が空でした（${finishReason}）。`);
    }
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGroundedNews() {
  if (!relayUrl || !relayKey) throw new Error("Gemini relay 未設定");
  const { system, userPrompt } = buildNewsPrompts();
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };
  return callRelay(model, body);
}

async function fetchRssItems(feedUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "SolunaNewsBot/1.1 (+https://www.aquacore.net)" },
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}: ${feedUrl}`);
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
    return rawItems.slice(0, 8).map((item) => {
      const title =
        typeof item.title === "string" ? item.title : (item.title?._ ?? item.title ?? "");
      const desc =
        typeof item.description === "string"
          ? item.description
          : (item.description?._ ?? item.summary?._ ?? item.summary ?? "");
      const link =
        typeof item.link === "string"
          ? item.link
          : (item.link?.["$"]?.href ?? item.guid?._ ?? item.guid ?? "");
      const published =
        parseDate(item.pubDate) ||
        parseDate(item.published) ||
        parseDate(item.updated) ||
        parseDate(item["dc:date"]);
      return {
        title: stripHtml(title).slice(0, 120),
        description: stripHtml(desc).slice(0, 200),
        link: typeof link === "string" ? link : "",
        publishedAt: published ? published.toISOString() : undefined,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNewsFromRss() {
  console.log("[fetch-soluna-news] Trying RSS fallback...");
  const itemsByKeyword = { "AI 最新動向": [], "世界経済": [] };
  const errors = [];
  const now = Date.now();

  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRssItems(feed.url);
      for (const item of items) {
        if (!item.title) continue;
        if (item.publishedAt && !isFreshPublishedAt(item.publishedAt, now)) continue;
        itemsByKeyword[feed.keyword].push(item);
      }
      console.log(`[fetch-soluna-news] RSS OK: ${feed.url} (${items.length} items)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.warn(`[fetch-soluna-news] RSS failed: ${feed.url} —`, msg);
    }
  }

  const resultItems = [];
  for (const [keyword, items] of Object.entries(itemsByKeyword)) {
    const selected = items
      .sort((a, b) => {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return tb - ta;
      })
      .filter((item, index, arr) => {
        const key = item.title.toLowerCase();
        return arr.findIndex((x) => x.title.toLowerCase() === key) === index;
      })
      .slice(0, 2);
    for (const item of selected) {
      const title = item.title;
      resultItems.push({
        keyword,
        title,
        summary: item.description.slice(0, 120) || title,
        sourceUrl: item.link || undefined,
        publishedAt: item.publishedAt,
        monsterName: deterministicMonsterName(title),
        rank: deterministicRank(title),
        species: deterministicSpecies(title),
      });
    }
  }

  if (resultItems.length === 0) {
    throw new Error(`RSS も全フィード失敗: ${errors.slice(0, 2).join(" / ")}`);
  }

  const summary = resultItems.map((i) => i.title).join(" / ").slice(0, 200);
  console.log(`[fetch-soluna-news] RSS fallback: ${resultItems.length} items`);
  return { items: resultItems, summary };
}

async function ingestBriefing(briefing) {
  const response = await fetch(`${baseUrl}/api/soluna/cron/system-briefing`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ step: "ingest", briefing }),
  });
  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
  console.log(`HTTP ${response.status}`);
  if (!response.ok) process.exit(1);
}

let parsed;
let source = "gemini-grounding";

try {
  const rawText = await fetchGroundedNews();
  parsed = JSON.parse(stripJsonFence(rawText));
  const groundedItems = normalizeItems(parsed, KEYWORDS);
  if (!itemsLookGrounded(groundedItems)) {
    throw new Error("grounding items lack sourceUrl / freshness; use RSS");
  }
  parsed = { ...parsed, items: groundedItems };
  console.log("[fetch-soluna-news] Source: Gemini Grounding");
} catch (err1) {
  console.warn("[fetch-soluna-news] grounding failed, RSS fallback:", err1.message);
  source = "rss";
  try {
    parsed = await fetchNewsFromRss();
    console.log("[fetch-soluna-news] Source: RSS feeds");
  } catch (err2) {
    console.error("[fetch-soluna-news] All live sources failed:", err2.message);
    console.error("[fetch-soluna-news] Refusing ungrounded Gemini (stale training-data news).");
    process.exit(1);
  }
}

const items = normalizeItems(parsed, KEYWORDS);
if (items.length === 0) {
  console.error("ニュース項目を抽出できませんでした。");
  process.exit(1);
}

const briefing = {
  id: briefingDocIdForDate(),
  keywords: KEYWORDS,
  items,
  fetchedAt: new Date().toISOString(),
  source,
  summary:
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : items.map((item) => item.title).join(" / "),
};

await ingestBriefing(briefing);
