import { stripJsonFence } from "@/lib/server/gemini";
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import { fetchFreshNewsFromRss } from "@/lib/server/soluna-news-rss";
import { SOLUNA_SYSTEM_KEYWORDS, jstDateString } from "@/lib/server/soluna-system-config";
import {
  briefingDocIdForDate,
  getBriefingById,
  getLatestBriefing,
  saveBriefing,
} from "@/lib/server/soluna-system-store";
import { enrichBriefingWithMonsters, formatEncounterForPrompt, monsterizeNewsItem } from "@/lib/soluna-monsters";
import type { SolunaNewsBriefing, SolunaNewsItem } from "@/lib/types/soluna";

const NEWS_TIMEOUT_MS = 25_000;
const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function buildNewsPrompts(keywords: string[]) {
  const todayJst = jstDateString();
  const system = `あなたはニュースキュレーターです。Google 検索で「今日（JST ${todayJst}）」時点の最新報道だけを調べます。
学習データの記憶や半年前の話題の再利用は禁止。事実ベースで簡潔に。推測は summary に含めない。JSON のみ返してください。`;
  const userPrompt = `基準日（JST）: ${todayJst}
次のキーワードについて、直近48時間以内に新たに報じられた重要ニュースをそれぞれ1〜2件ずつ調べてください: ${keywords.join("、")}

厳守:
- 各 item に実在する sourceUrl と publishedAt（ISO8601 日付）を付ける。48時間より古い記事は出さない。
- 関税・貿易・AI でも、基準日から見て古い出来事の再掲は禁止。今日〜一昨日の動きに限定。
- 「懸念が続く」「依然として燻る」だけの背景説明は不可。誰が・何を・いつ発表／決定したかの新事実がある記事だけ。

各記事は討伐対象のモンスターとして命名する。monsterName はゲーム風（例: 暴走規制竜レギュラ）だが、元ニュースの意味が残ること。rank は議論の難しさ 1〜5。

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

function isFreshPublishedAt(value: unknown, now = Date.now()): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= MAX_ITEM_AGE_MS;
}

function normalizeItems(raw: unknown, keywords: readonly string[]): SolunaNewsItem[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const allowed = new Set(keywords);
  const result: SolunaNewsItem[] = [];
  const now = Date.now();

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
    const publishedAt =
      typeof row.publishedAt === "string" && row.publishedAt.trim()
        ? row.publishedAt.trim()
        : undefined;
    // 古い日付が明示されている項目は捨てる（日付なしは後段で RSS と併用判定）
    if (publishedAt && !isFreshPublishedAt(publishedAt, now)) continue;
    if (!title || !summary) continue;
    result.push(
      monsterizeNewsItem(
        { title, summary, keyword, sourceUrl, publishedAt },
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

function itemsLookGrounded(items: SolunaNewsItem[]): boolean {
  if (items.length === 0) return false;
  const withUrl = items.filter((item) => item.sourceUrl).length;
  return withUrl >= Math.ceil(items.length / 2);
}

async function fetchNewsFromGrounding(
  keywords: string[],
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const { system, userPrompt } = buildNewsPrompts(keywords);
  return generateWithGoogleSearch({
    system,
    userPrompt,
    timeoutMs: NEWS_TIMEOUT_MS,
    maxOutputTokens: 3000,
  });
}

async function fetchNewsFromRssAsBriefingItems(
  keywords: string[],
): Promise<SolunaNewsItem[]> {
  const rss = await fetchFreshNewsFromRss({ keywords, perKeyword: 2 });
  return rss.items.map((item) =>
    monsterizeNewsItem({
      title: item.title,
      summary: item.summary,
      keyword: item.keyword,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
    }),
  );
}

/**
 * 学習データ由来の古いネタになるため、非 grounding LLM フォールバックは使わない。
 * 検索失敗時は RSS（直近記事）へ倒す。
 */
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

  // 趣味キーワードは検索を濁らせるのでニュース本体には混ぜない
  const uniqueKeywords = [...new Set([...SOLUNA_SYSTEM_KEYWORDS])];
  void options?.interestKeywords;

  let source = "gemini-grounding";
  let items: SolunaNewsItem[] = [];
  let summary = "";

  const grounded = await fetchNewsFromGrounding(uniqueKeywords);
  if (grounded.ok) {
    try {
      const parsed = JSON.parse(stripJsonFence(grounded.text)) as {
        summary?: string;
        items?: unknown;
      };
      items = normalizeItems(parsed, uniqueKeywords);
      summary =
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "";
      if (!itemsLookGrounded(items)) {
        console.warn(
          "[soluna-news] grounding returned weak/unverified items; preferring RSS",
        );
        items = [];
      }
    } catch {
      console.warn("[soluna-news] grounding JSON parse failed; preferring RSS");
      items = [];
    }
  } else {
    console.warn("[soluna-news] grounding failed, RSS fallback:", grounded.reason);
  }

  if (items.length === 0) {
    try {
      items = await fetchNewsFromRssAsBriefingItems(uniqueKeywords);
      source = "rss";
      summary = items.map((item) => item.title).join(" / ");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: `最新ニュースを取得できませんでした（検索失敗 → RSS 失敗: ${reason}）`,
      };
    }
  }

  if (items.length === 0) {
    return { ok: false, reason: "ニュース項目を抽出できませんでした。" };
  }

  const briefing: SolunaNewsBriefing = {
    id: docId,
    keywords: uniqueKeywords,
    items,
    fetchedAt: new Date().toISOString(),
    source,
    summary: summary || items.map((item) => item.title).join(" / "),
  };

  await saveBriefing(briefing);
  return { ok: true, briefing };
}

export async function getBriefingForHumanChat(): Promise<SolunaNewsBriefing | null> {
  const todayId = briefingDocIdForDate();
  const today = await getBriefingById(todayId);
  if (today) {
    const gate = assertTodayLiveBriefing(today);
    return gate.ok ? gate.briefing : null;
  }

  // 当日分が無いときだけ最新を見るが、鮮度ゲートを通らなければ出さない
  const briefing = await getLatestBriefing();
  if (!briefing) return null;
  const gate = assertTodayLiveBriefing(briefing);
  return gate.ok ? gate.briefing : null;
}

/** 当日・ライブ由来のブリーフィングか（討伐・Note・資産センチメントの前提） */
export function assertTodayLiveBriefing(
  briefing: SolunaNewsBriefing | null | undefined,
  date = new Date(),
): { ok: true; briefing: SolunaNewsBriefing } | { ok: false; reason: string } {
  if (!briefing) {
    return { ok: false, reason: "ブリーフィングがありません。" };
  }
  const todayId = briefingDocIdForDate(date);
  if (briefing.id !== todayId) {
    return {
      ok: false,
      reason: `当日以外のブリーフィングは討伐に使えない（got ${briefing.id}, want ${todayId}）。`,
    };
  }
  const source = (briefing.source ?? "").toLowerCase();
  if (
    source.includes("fallback") ||
    source.includes("no-grounding") ||
    source.includes("ungrounded") ||
    source === "gemini"
  ) {
    return {
      ok: false,
      reason: `ライブ非対応ソースのブリーフィングは使えない（source=${briefing.source}）。学習データ由来の古いネタの可能性がある。`,
    };
  }
  if (!briefing.items?.length) {
    return { ok: false, reason: "ブリーフィングにニュース項目がありません。" };
  }
  const withUrl = briefing.items.filter((item) => item.sourceUrl).length;
  // RSS / grounding どちらも原則 URL 付き。ゼロなら疑わしい
  if (withUrl === 0) {
    return {
      ok: false,
      reason: "出典 URL のないブリーフィングはライブニュースとして扱えない。",
    };
  }
  return { ok: true, briefing };
}
