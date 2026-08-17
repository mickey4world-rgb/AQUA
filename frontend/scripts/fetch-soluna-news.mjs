/**
 * Soluna ニュース取得（GitHub Actions 用）
 * SWA の 45 秒制限を避け、Gemini Grounding を中継 Functions 経由で実行する。
 */
const KEYWORDS = ["AI 最新動向", "世界経済"];
const GROUNDING_TIMEOUT_MS = 120_000;

const relayUrl = process.env.GEMINI_RELAY_URL?.trim();
const relayKey = process.env.GEMINI_RELAY_KEY?.trim();
const cronSecret = process.env.SOLUNA_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(/\/$/, "");
const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

if (!relayUrl || !relayKey || !cronSecret) {
  console.error("GEMINI_RELAY_URL, GEMINI_RELAY_KEY, SOLUNA_CRON_SECRET が必要です。");
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
    result.push({ title, summary, keyword, sourceUrl });
  }
  return result;
}

async function fetchGroundedNews() {
  const { system, userPrompt } = buildNewsPrompts();

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 4096 },
  };

  return callRelay(model, body);
}

async function fetchNewsWithoutGrounding() {
  const { system, userPrompt } = buildNewsPrompts();

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 3000,
      responseMimeType: "application/json",
    },
  };

  return callRelay(model, body);
}

function buildNewsPrompts() {
  const system = `あなたはニュースキュレーターです。Google 検索で最新情報を調べ、指定キーワードごとに重要なニュースを選びます。
事実ベースで簡潔に。推測は summary に含めない。JSON のみ返してください。`;
  const userPrompt = `次のキーワードについて、直近24〜72時間の重要ニュースをそれぞれ1〜2件ずつ調べてください: ${KEYWORDS.join("、")}

JSON 形式:
{
  "summary": "全体を2〜3文で要約",
  "items": [
    {
      "keyword": "AI 最新動向",
      "title": "見出し",
      "summary": "80文字以内の要点",
      "sourceUrl": "https://..."
    }
  ]
}`;
  return { system, userPrompt };
}

async function callRelay(modelName, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROUNDING_TIMEOUT_MS);

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

    const text =
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("ニュース検索の結果が空でした。");
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
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

let rawText;
try {
  rawText = await fetchGroundedNews();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn("[fetch-soluna-news] grounding failed, fallback:", reason);
  rawText = await fetchNewsWithoutGrounding();
}
const parsed = JSON.parse(stripJsonFence(rawText));
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
  summary:
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : items.map((item) => item.title).join(" / "),
};

await ingestBriefing(briefing);
