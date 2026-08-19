/**
 * Soluna ニュース取得（GitHub Actions 用）
 * SWA の 45 秒制限を避け、Gemini Grounding を中継 Functions 経由で実行する。
 *
 * フォールバック順:
 *   1. Gemini Grounding（Google 検索付き）via relay
 *   2. Gemini 非 Grounding（relay の別モデルで再試行）
 *   3. RSS 直接取得（NHK / Reuters Japan / Ars Technica 等）+ タイトル・本文でモンスター生成
 */

import { parseStringPromise } from "xml2js";

const KEYWORDS = ["AI 最新動向", "世界経済"];
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-flash-latest";
const FALLBACK_MODELS = [
  FALLBACK_MODEL,
  process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash",
].filter((value, index, array) => array.indexOf(value) === index);
const RELAY_TIMEOUT_MS = 110_000;

// RSS フィード定義（公開・認証不要）
const RSS_FEEDS = [
  // AI 最新動向
  { url: "https://feeds.arstechnica.com/arstechnica/technology-lab", keyword: "AI 最新動向" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", keyword: "AI 最新動向" },
  // 世界経済
  { url: "https://feeds.reuters.com/reuters/businessNews", keyword: "世界経済" },
  { url: "https://www.nhk.or.jp/rss/news/cat6.xml", keyword: "世界経済" }, // NHK 経済
  { url: "https://www.nhk.or.jp/rss/news/cat5.xml", keyword: "世界経済" }, // NHK 科学・医療（AI 含む）
];

// モンスター名を決定論的に生成（LLM 不要）
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRelayError(message) {
  const msg = message.toLowerCase();
  return (
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("try again") ||
    msg.includes("resource exhausted") ||
    msg.includes("timed out") ||
    msg.includes("結果が空")
  );
}

const relayUrl = process.env.GEMINI_RELAY_URL?.trim();
const relayKey = process.env.GEMINI_RELAY_KEY?.trim();
const cronSecret = process.env.SOLUNA_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(/\/$/, "");
const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

if (!cronSecret) {
  console.error("SOLUNA_CRON_SECRET が必要です。");
  process.exit(1);
}

function briefingDocIdForDate(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `briefing-${y}-${m}-${d}`;
}

function stripJsonFence(text) {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced ? fenced[1] : text.trim();
}

function normalizeItems(raw, keywords) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return [];
  const allowed = new Set(keywords);
  const result = [];
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
    if (!title || !summary) continue;
    result.push({
      title,
      summary,
      keyword,
      sourceUrl,
      monsterName: typeof item.monsterName === "string" ? item.monsterName.trim() : undefined,
      rank: typeof item.rank === "number" ? item.rank : undefined,
      species: typeof item.species === "string" ? item.species : undefined,
    });
  }
  return result;
}

// ── Gemini 経由 ──────────────────────────────────────────────────────────────

async function fetchGroundedNews() {
  if (!relayUrl || !relayKey) throw new Error("Gemini relay 未設定");
  const { system, userPrompt } = buildNewsPrompts(true);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 4096 },
  };
  return callRelay(model, body);
}

async function fetchNewsWithoutGrounding() {
  if (!relayUrl || !relayKey) throw new Error("Gemini relay 未設定");
  const { system, userPrompt } = buildNewsPrompts(false);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 4096 },
  };

  let lastReason = "ニュース取得に失敗しました。";
  for (const modelName of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await callRelay(modelName, body);
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
        if (isRetryableRelayError(lastReason) && attempt < 2) {
          console.warn(`[fetch-soluna-news] retry ${modelName} attempt ${attempt + 1}:`, lastReason);
          await sleep(2000 * (attempt + 1));
          continue;
        }
        console.warn(`[fetch-soluna-news] fallback model ${modelName} failed:`, lastReason);
        break;
      }
    }
  }
  throw new Error(lastReason);
}

function buildNewsPrompts(grounded) {
  const system = grounded
    ? `あなたはニュースキュレーターです。Google 検索で最新情報を調べ、指定キーワードごとに重要なニュースを選びます。
事実ベースで簡潔に。推測は summary に含めない。JSON のみ返してください。`
    : `あなたはニュースキュレーターです。指定キーワードについて、一般に知られている最新の公開情報を要約します。
不確かな情報は含めず、推測は summary に含めない。JSON のみ返してください。`;
  const userPrompt = `次のキーワードについて、直近24〜72時間の重要ニュースをそれぞれ1〜2件ずつ調べてください: ${KEYWORDS.join("、")}

各記事は討伐対象のモンスターとして命名する。monsterName はゲーム風（例: 暴走規制竜レギュラ）だが、元ニュースの意味が残ること。rank は議論の難しさ 1〜5。species は dragon / slime / golem / shadow / chimera。

JSON 形式:
{
  "summary": "全体を2〜3文で要約",
  "items": [
    {
      "keyword": "AI 最新動向",
      "title": "見出し",
      "summary": "80文字以内の要点",
      "sourceUrl": "https://...",
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

// ── RSS フォールバック ─────────────────────────────────────────────────────────

async function fetchRssItems(feedUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "SolunaNewsBot/1.0" },
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
    return rawItems.slice(0, 5).map((item) => {
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
      return {
        title: title.replace(/<[^>]+>/g, "").trim().slice(0, 120),
        description: desc.replace(/<[^>]+>/g, "").trim().slice(0, 200),
        link: typeof link === "string" ? link : "",
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNewsFromRss() {
  console.log("[fetch-soluna-news] Trying RSS fallback...");

  // xml2js が入っているか確認（GHA の Node.js 環境）
  // package.json に依存しないため動的 import でエラーハンドリング
  const itemsByKeyword = { "AI 最新動向": [], "世界経済": [] };
  const errors = [];

  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRssItems(feed.url);
      for (const item of items) {
        if (!item.title) continue;
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
    const selected = items.slice(0, 2);
    for (const item of selected) {
      const title = item.title;
      resultItems.push({
        keyword,
        title,
        summary: item.description.slice(0, 120) || title,
        sourceUrl: item.link || undefined,
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

// ── ingest ───────────────────────────────────────────────────────────────────

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

// ── メイン ────────────────────────────────────────────────────────────────────

let parsed;
let source = "gemini-grounding";

try {
  const rawText = await fetchGroundedNews();
  parsed = JSON.parse(stripJsonFence(rawText));
  console.log("[fetch-soluna-news] Source: Gemini Grounding");
} catch (err1) {
  console.warn("[fetch-soluna-news] grounding failed, fallback:", err1.message);
  source = "gemini-fallback";
  try {
    const rawText = await fetchNewsWithoutGrounding();
    parsed = JSON.parse(stripJsonFence(rawText));
    console.log("[fetch-soluna-news] Source: Gemini (no grounding)");
  } catch (err2) {
    console.warn("[fetch-soluna-news] Gemini fallback failed:", err2.message);
    source = "rss";
    try {
      parsed = await fetchNewsFromRss();
      console.log("[fetch-soluna-news] Source: RSS feeds");
    } catch (err3) {
      console.error("[fetch-soluna-news] All sources failed:", err3.message);
      process.exit(1);
    }
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
