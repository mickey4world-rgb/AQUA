import {
  generateWithGemini,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import { SOLUNA_SYSTEM_KEYWORDS } from "@/lib/server/soluna-system-config";
import {
  briefingDocIdForDate,
  getLatestBriefing,
  saveBriefing,
} from "@/lib/server/soluna-system-store";
import { enrichBriefingWithMonsters, formatEncounterForPrompt, monsterizeNewsItem } from "@/lib/soluna-monsters";
import type { SolunaNewsBriefing, SolunaNewsItem } from "@/lib/types/soluna";

const NEWS_TIMEOUT_MS = 25_000;

/** Google Search grounding が使えるモデルを優先（gemini-flash-latest エイリアスは非対応のことがある） */
function getGroundingModelCandidates(): string[] {
  const env = process.env.SOLUNA_NEWS_GEMINI_MODEL?.trim();
  const defaults = ["gemini-3.6-flash", "gemini-flash-latest"];
  return env ? [...new Set([env, ...defaults])] : defaults;
}

function getRelay(): { url: string; key: string } | null {
  const url = process.env.GEMINI_RELAY_URL?.trim();
  const key = process.env.GEMINI_RELAY_KEY?.trim();
  return url && key ? { url, key } : null;
}

async function generateWithGroundingOnce(
  model: string,
  system: string,
  userPrompt: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const relay = getRelay();
  const apiKey = process.env.GEMINI_API_KEY;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 4096,
    },
  };

  const target: { url: string; headers: Record<string, string>; body: string } = relay
    ? {
        url: relay.url,
        headers: {
          "Content-Type": "application/json",
          "x-functions-key": relay.key,
        },
        body: JSON.stringify({ model, body }),
      }
    : {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey as string,
        },
        body: JSON.stringify(body),
      };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);

  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: target.headers,
      signal: controller.signal,
      body: target.body,
    });

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        ok: false,
        reason: payload.error?.message ?? `Gemini ニュース取得失敗（HTTP ${response.status}）`,
      };
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) {
      return { ok: false, reason: "ニュース検索の結果が空でした。" };
    }

    return { ok: true, text: text.trim(), model };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: aborted ? "ニュース検索がタイムアウトしました。" : "ニュース検索に失敗しました。",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithGrounding(
  system: string,
  userPrompt: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: "Gemini が未設定です。" };
  }

  let lastReason = "ニュース検索に失敗しました。";
  for (const model of getGroundingModelCandidates()) {
    const result = await generateWithGroundingOnce(model, system, userPrompt);
    if (result.ok) return result;
    lastReason = result.reason;
    console.warn(`[soluna-news] grounding failed for ${model}:`, result.reason);
  }

  return { ok: false, reason: lastReason };
}

async function generateNewsWithoutGrounding(
  system: string,
  userPrompt: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const result = await generateWithGemini(
    {
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: 3000,
      temperature: 0.35,
      responseMimeType: "application/json",
    },
    { timeoutMs: NEWS_TIMEOUT_MS, maxAttempts: 2 },
  );
  if (!result.ok) return result;
  return { ok: true, text: result.text, model: result.model };
}

async function fetchNewsContent(
  system: string,
  userPrompt: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const grounded = await generateWithGrounding(system, userPrompt);
  if (grounded.ok) return grounded;
  console.warn("[soluna-news] grounding failed, fallback:", grounded.reason);
  return generateNewsWithoutGrounding(system, userPrompt);
}

function normalizeItems(raw: unknown, keywords: readonly string[]): SolunaNewsItem[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const allowed = new Set(keywords);
  const result: SolunaNewsItem[] = [];

  for (const item of items.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const summary = typeof row.summary === "string" ? row.summary.trim() : "";
    const keyword =
      typeof row.keyword === "string" && allowed.has(row.keyword)
        ? row.keyword
        : keywords[0];
    const sourceUrl =
      typeof row.sourceUrl === "string" && row.sourceUrl.startsWith("http")
        ? row.sourceUrl
        : undefined;
    if (!title || !summary) continue;
    result.push(
      monsterizeNewsItem(
        { title, summary, keyword, sourceUrl },
        {
          monsterName: typeof row.monsterName === "string" ? row.monsterName : undefined,
          rank: typeof row.rank === "number" ? row.rank : undefined,
          species: typeof row.species === "string" ? row.species : undefined,
        },
      ),
    );
  }

  return result;
}

export function formatBriefingForPrompt(briefing: SolunaNewsBriefing): string {
  return formatEncounterForPrompt(enrichBriefingWithMonsters(briefing));
}

export async function fetchGlobalNewsBriefing(options?: {
  force?: boolean;
  interestKeywords?: string[];
}): Promise<{ ok: true; briefing: SolunaNewsBriefing } | { ok: false; reason: string }> {
  const docId = briefingDocIdForDate();
  if (!options?.force) {
    const existing = await getLatestBriefing();
    if (existing?.id === docId) {
      return { ok: true, briefing: existing };
    }
  }

  const keywords = [
    ...SOLUNA_SYSTEM_KEYWORDS,
    ...(options?.interestKeywords ?? []).slice(0, 4),
  ];
  const uniqueKeywords = [...new Set(keywords)];
  const result = await fetchNewsContent(
    `あなたはニュースキュレーターです。Google 検索で最新情報を調べ、指定キーワードごとに重要なニュースを選びます。
事実ベースで簡潔に。推測は summary に含めない。JSON のみ返してください。`,
    `次のキーワードについて、直近24〜72時間の重要ニュースをそれぞれ1〜2件ずつ調べてください: ${uniqueKeywords.join("、")}

各記事は討伐対象のモンスターとして命名する。monsterName はゲーム風（例: 暴走規制竜レギュラ）だが、元ニュースの意味が残ること。rank は議論の難しさ 1〜5。

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
}`,
  );

  if (!result.ok) return result;

  try {
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      summary?: string;
      items?: unknown;
    };
    const items = normalizeItems(parsed, uniqueKeywords);
    if (items.length === 0) {
      return { ok: false, reason: "ニュース項目を抽出できませんでした。" };
    }

    const briefing: SolunaNewsBriefing = {
      id: docId,
      keywords: uniqueKeywords,
      items,
      fetchedAt: new Date().toISOString(),
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : items.map((item) => item.title).join(" / "),
    };

    await saveBriefing(briefing);
    return { ok: true, briefing };
  } catch {
    return { ok: false, reason: "ニュース JSON の解析に失敗しました。" };
  }
}

export async function getBriefingForHumanChat(): Promise<SolunaNewsBriefing | null> {
  const briefing = await getLatestBriefing();
  if (!briefing) return null;

  const ageMs = Date.now() - new Date(briefing.fetchedAt).getTime();
  if (ageMs > 48 * 60 * 60 * 1000) return null;
  return briefing;
}
