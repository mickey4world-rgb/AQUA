import {
  generateWithGemini,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import { recordTokenUsage } from "@/lib/server/token-usage";
import { jstDateString } from "@/lib/server/soluna-system-config";
import {
  collectMultiSourceNewsSeeds,
  scoreAttentionSeed,
  type RawNewsSeed,
} from "@/lib/server/works-news-search-rss";
import {
  getLatestWorksNewsDigest,
  saveWorksNewsDigest,
  stableNewsItemId,
  worksNewsSearchDocId,
} from "@/lib/server/works-news-search-store";
import {
  NEWS_SEARCH_CATEGORIES,
  NEWS_SEARCH_CATEGORY_LABEL,
  type NewsSearchCategory,
  type NewsSearchChatMessage,
  type NewsSearchDigest,
  type NewsSearchItem,
} from "@/lib/types/works-news-search";

const MIN_PER_CATEGORY = 5;
const TARGET_PER_CATEGORY = 6;
const ENRICH_TIMEOUT_MS = 28_000;
const CHAT_TIMEOUT_MS = 28_000;

/** GHA RSS 取り込み時の仮文言（これが残っている＝解説未生成） */
export const NEWS_SEARCH_OUTLOOK_PLACEHOLDER =
  "今夜の解説生成で見通しを補完します（「今すぐ再取得」で詳細化可能）。";

export function isNewsSearchItemEnriched(item: NewsSearchItem): boolean {
  if (!item.outlook?.trim() || !item.deepDive?.trim() || !item.explanation?.trim()) {
    return false;
  }
  if (item.outlook.includes("今夜の解説生成")) return false;
  if (item.outlook.includes("「今すぐ再取得」で詳細化")) return false;
  // RSS 直後は summary をそのまま深堀にコピーしている
  if (item.deepDive === item.summary && item.explanation === item.summary) return false;
  return true;
}

export function digestNeedsEnrichment(digest: NewsSearchDigest): boolean {
  return NEWS_SEARCH_CATEGORIES.some((c) =>
    digest.categories[c].some((item) => !isNewsSearchItemEnriched(item)),
  );
}

function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

const USER_CONTEXT = `相談者の前提:
- 官公庁で勤務
- 司法分野の基盤（クラウド環境・基盤サービス）展開をリード
- 行政で政府事業 5000 以上を管理するシステムの AI 導入をリード
役立つ視点: クラウド基盤、セキュリティ・ガバナンス、調達、事業レビュー、行政 DX、司法 IT、コスト、運用負荷。`;

function emptyCategories(): Record<NewsSearchCategory, NewsSearchItem[]> {
  return { ai: [], systems: [], economy: [], government: [] };
}

function dedupeSeeds(seeds: RawNewsSeed[]): RawNewsSeed[] {
  const seen = new Set<string>();
  const out: RawNewsSeed[] = [];
  for (const seed of seeds) {
    const key = `${seed.category}:${(seed.sourceUrl || seed.title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(seed);
  }
  return out;
}

function pickTopSeeds(
  seeds: RawNewsSeed[],
  perCategory: number,
): Record<NewsSearchCategory, RawNewsSeed[]> {
  const now = Date.now();
  const bucket = emptyCategories() as unknown as Record<NewsSearchCategory, RawNewsSeed[]>;
  for (const category of NEWS_SEARCH_CATEGORIES) {
    bucket[category] = seeds
      .filter((s) => s.category === category)
      .map((s) => ({ seed: s, score: scoreAttentionSeed(s, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, perCategory)
      .map((row) => row.seed);
  }
  return bucket;
}

function seedToItem(seed: RawNewsSeed): NewsSearchItem {
  const score = scoreAttentionSeed(seed);
  return {
    id: stableNewsItemId(seed.category, seed.title, seed.sourceUrl),
    category: seed.category,
    title: seed.title,
    summary: seed.summary,
    deepDive: seed.summary,
    outlook: NEWS_SEARCH_OUTLOOK_PLACEHOLDER,
    explanation: seed.summary,
    govRelevance:
      "官公庁・基盤運用の観点では、一次情報の確認と影響範囲の洗い出しから始めるのが安全です。",
    sources: seed.sourceUrl
      ? [{ name: seed.sourceName, url: seed.sourceUrl }]
      : [{ name: seed.sourceName, url: "" }],
    attentionScore: score,
    publishedAt: seed.publishedAt,
  };
}

async function enrichCategoryWithGemini(
  category: NewsSearchCategory,
  items: NewsSearchItem[],
): Promise<{ items: NewsSearchItem[]; enriched: boolean; reason?: string }> {
  if (!isGeminiConfigured()) {
    return { items, enriched: false, reason: "Gemini が未設定です。" };
  }
  if (items.length === 0) {
    return { items, enriched: true };
  }

  const today = jstDateString();
  const payload = items.map((item, index) => ({
    index,
    title: item.title,
    summary: item.summary,
    sourceUrl: item.sources[0]?.url,
    sourceName: item.sources[0]?.name,
    publishedAt: item.publishedAt,
    attentionHint: item.attentionScore,
  }));

  const system = `あなたは官公庁向けテックアナリストです。与えられた「今日の生ニュース一覧」だけを根拠に、各記事を深堀・解説します。
学習データの古い一般知識でニュースを捏造しないこと。一覧に無い出来事は書かない。
${USER_CONTEXT}
JSON のみ返す。`;

  const userPrompt = `基準日 JST: ${today}
カテゴリ: ${NEWS_SEARCH_CATEGORY_LABEL[category]}

生ニュース:
${JSON.stringify(payload, null, 2)}

各 index について次を埋めてください（items 配列）。仮文言や「今夜補完」は禁止。必ず具体的に書く。
- deepDive: 背景・論点の深堀（120〜220字）
- outlook: 今後30〜90日の予想（80〜160字）
- explanation: 非専門家にも分かる解説（100〜180字）
- govRelevance: 司法基盤クラウド／政府事業管理AI導入の実務への示唆（80〜160字）
- attentionScore: 注目度 0〜100（今日の新しさと実務影響）

JSON:
{ "items": [ { "index": 0, "deepDive": "...", "outlook": "...", "explanation": "...", "govRelevance": "...", "attentionScore": 72 } ] }`;

  // SWA 時間内に収めるため、まず通常 Gemini（記事一覧が根拠）。失敗時のみ grounding。
  let text = "";
  let modelUsed = "";
  const local = await generateWithGemini(
    {
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: 4096,
      temperature: 0.25,
      responseMimeType: "application/json",
    },
    { timeoutMs: ENRICH_TIMEOUT_MS, maxAttempts: 2 },
  );
  if (local.ok) {
    text = local.text;
    modelUsed = local.model;
  } else {
    const grounded = await generateWithGoogleSearch({
      system,
      userPrompt: `${userPrompt}\n必要なら Google 検索で各 sourceUrl の直近事実だけ確認してよい。`,
      timeoutMs: ENRICH_TIMEOUT_MS,
      maxOutputTokens: 4096,
    });
    if (!grounded.ok) {
      return {
        items,
        enriched: false,
        reason: `解説生成失敗: ${local.reason} / ${grounded.reason}`,
      };
    }
    text = grounded.text;
    modelUsed = grounded.model;
  }

  await recordTokenUsage({
    userId: "__works-news-search__",
    feature: "works-news-search-enrich",
    model: modelUsed,
    promptTokens: approxTokens(userPrompt),
    completionTokens: approxTokens(text),
  });

  try {
    const parsed = JSON.parse(stripJsonFence(text)) as {
      items?: Array<Record<string, unknown>>;
    };
    const rows = Array.isArray(parsed.items) ? parsed.items : [];
    if (rows.length === 0) {
      return { items, enriched: false, reason: "解説 JSON が空でした。" };
    }
    const next = items.map((item, index) => {
      const row = rows.find((r) => r.index === index) ?? rows[index];
      if (!row) return item;
      const attention =
        typeof row.attentionScore === "number"
          ? Math.max(1, Math.min(100, Math.round(row.attentionScore)))
          : item.attentionScore;
      return {
        ...item,
        deepDive:
          typeof row.deepDive === "string" && row.deepDive.trim()
            ? row.deepDive.trim()
            : item.deepDive,
        outlook:
          typeof row.outlook === "string" && row.outlook.trim()
            ? row.outlook.trim()
            : item.outlook,
        explanation:
          typeof row.explanation === "string" && row.explanation.trim()
            ? row.explanation.trim()
            : item.explanation,
        govRelevance:
          typeof row.govRelevance === "string" && row.govRelevance.trim()
            ? row.govRelevance.trim()
            : item.govRelevance,
        attentionScore: attention,
      };
    });
    const enrichedCount = next.filter((item) => isNewsSearchItemEnriched(item)).length;
    if (enrichedCount === 0) {
      return { items, enriched: false, reason: "解説がプレースホルダのままです。" };
    }
    return { items: next, enriched: true };
  } catch (error) {
    console.warn("[works-news-search] enrich JSON parse failed", error);
    return { items, enriched: false, reason: "解説 JSON の解析に失敗しました。" };
  }
}

/**
 * 既存ダイジェストの1カテゴリだけ AI 解説する（SWA タイムアウト回避）。
 */
export async function enrichWorksNewsDigestCategory(
  category: NewsSearchCategory,
): Promise<
  | { ok: true; digest: NewsSearchDigest; enrichedCount: number }
  | { ok: false; reason: string }
> {
  const existing = await getLatestWorksNewsDigest();
  if (!existing) {
    return { ok: false, reason: "先にニュース一覧が必要です。深夜取得を待つか、一覧を再取得してください。" };
  }

  const base = existing.categories[category] ?? [];
  if (base.length === 0) {
    return { ok: true, digest: existing, enrichedCount: 0 };
  }

  const result = await enrichCategoryWithGemini(category, base);
  if (!result.enriched) {
    return { ok: false, reason: result.reason ?? `${NEWS_SEARCH_CATEGORY_LABEL[category]} の解説に失敗しました。` };
  }

  const categories = { ...existing.categories, [category]: result.items };
  const allEnriched = !digestNeedsEnrichment({ ...existing, categories });
  const digest: NewsSearchDigest = {
    ...existing,
    categories,
    source: allEnriched ? "rss+gemini" : "mixed",
    fetchedAt: new Date().toISOString(),
    summary: NEWS_SEARCH_CATEGORIES.map((c) => {
      const top = categories[c][0];
      return `${NEWS_SEARCH_CATEGORY_LABEL[c]}: ${top?.title ?? "—"}`;
    }).join(" / "),
  };

  try {
    await saveWorksNewsDigest(digest);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `保存に失敗しました: ${reason}` };
  }

  return {
    ok: true,
    digest,
    enrichedCount: result.items.filter((item) => isNewsSearchItemEnriched(item)).length,
  };
}

export async function buildWorksNewsDigest(options?: {
  force?: boolean;
}): Promise<{ ok: true; digest: NewsSearchDigest } | { ok: false; reason: string }> {
  const docId = worksNewsSearchDocId();
  if (!options?.force) {
    const existing = await getLatestWorksNewsDigest();
    if (existing?.id === docId) return { ok: true, digest: existing };
  }

  const { seeds, errors } = await collectMultiSourceNewsSeeds();
  const unique = dedupeSeeds(seeds);
  const picked = pickTopSeeds(unique, TARGET_PER_CATEGORY);

  for (const category of NEWS_SEARCH_CATEGORIES) {
    if (picked[category].length < MIN_PER_CATEGORY) {
      console.warn(
        `[works-news-search] ${category} only ${picked[category].length} items`,
        errors.slice(0, 3),
      );
    }
  }

  const totalPicked = NEWS_SEARCH_CATEGORIES.reduce(
    (sum, c) => sum + picked[c].length,
    0,
  );
  if (totalPicked === 0) {
    return {
      ok: false,
      reason: `ニュースを取得できませんでした: ${errors.slice(0, 3).join(" / ") || "empty"}`,
    };
  }

  const categories = emptyCategories();
  let enrichedAny = false;
  const enrichErrors: string[] = [];
  for (const category of NEWS_SEARCH_CATEGORIES) {
    const base = picked[category].map(seedToItem);
    const result = await enrichCategoryWithGemini(category, base);
    if (result.enriched) enrichedAny = true;
    else if (result.reason) enrichErrors.push(`${category}: ${result.reason}`);
    categories[category] = result.items
      .slice()
      .sort((a, b) => b.attentionScore - a.attentionScore);
  }

  const digest: NewsSearchDigest = {
    id: docId,
    fetchedAt: new Date().toISOString(),
    source: enrichedAny ? "rss+gemini" : "rss",
    categories,
    solunaSynced: false,
    summary: NEWS_SEARCH_CATEGORIES.map((c) => {
      const top = categories[c][0];
      return `${NEWS_SEARCH_CATEGORY_LABEL[c]}: ${top?.title ?? "—"}`;
    }).join(" / "),
  };

  try {
    await saveWorksNewsDigest(digest);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `保存に失敗しました: ${reason}` };
  }

  return { ok: true, digest };
}

export async function markWorksNewsSolunaSynced(digest: NewsSearchDigest): Promise<void> {
  if (digest.solunaSynced) return;
  const next = { ...digest, solunaSynced: true };
  await saveWorksNewsDigest(next);
}

/** Soluna 討伐向けに AI／経済の上位を抽出 */
export function mapDigestToSolunaSeedItems(digest: NewsSearchDigest): Array<{
  keyword: string;
  title: string;
  summary: string;
  sourceUrl?: string;
  publishedAt?: string;
}> {
  const ai = digest.categories.ai.slice(0, 3).map((item) => ({
    keyword: "AI 最新動向",
    title: item.title,
    summary: item.explanation || item.summary,
    sourceUrl: item.sources.find((s) => s.url)?.url,
    publishedAt: item.publishedAt,
  }));
  const economy = digest.categories.economy.slice(0, 3).map((item) => ({
    keyword: "世界経済",
    title: item.title,
    summary: item.explanation || item.summary,
    sourceUrl: item.sources.find((s) => s.url)?.url,
    publishedAt: item.publishedAt,
  }));
  return [...ai, ...economy];
}

export async function chatWorksNewsSearch(options: {
  userId: string;
  message: string;
  history?: NewsSearchChatMessage[];
  itemId?: string;
  digest?: NewsSearchDigest | null;
}): Promise<{ ok: true; reply: string; model: string } | { ok: false; reason: string }> {
  const message = options.message.trim();
  if (!message) return { ok: false, reason: "メッセージが空です。" };
  if (!isGeminiConfigured()) return { ok: false, reason: "Gemini が未設定です。" };

  const digest = options.digest ?? (await getLatestWorksNewsDigest());
  if (!digest) {
    return { ok: false, reason: "本日のニュースサーチ結果がまだありません。" };
  }

  const allItems = NEWS_SEARCH_CATEGORIES.flatMap((c) => digest.categories[c]);
  const focus =
    (options.itemId
      ? allItems.find((item) => item.id === options.itemId)
      : undefined) ?? null;

  const digestBrief = NEWS_SEARCH_CATEGORIES.map((c) => {
    const lines = digest.categories[c]
      .slice(0, 6)
      .map(
        (item) =>
          `- [${item.attentionScore}] ${item.title}｜${item.explanation.slice(0, 80)}｜出典:${item.sources.map((s) => s.name).join(",")}`,
      )
      .join("\n");
    return `### ${NEWS_SEARCH_CATEGORY_LABEL[c]}\n${lines || "- （なし）"}`;
  }).join("\n\n");

  const focusBlock = focus
    ? `## フォーカス中の記事
タイトル: ${focus.title}
注目度: ${focus.attentionScore}
要約: ${focus.summary}
深堀: ${focus.deepDive}
今後: ${focus.outlook}
解説: ${focus.explanation}
官公庁示唆: ${focus.govRelevance}
出典: ${focus.sources.map((s) => `${s.name} ${s.url}`).join(" / ")}`
    : "（特定記事は未選択。ダイジェスト全体を踏まえて答える）";

  const history = (options.history ?? []).slice(-8);
  const transcript = history
    .map((m) => `${m.role === "user" ? "ユーザー" : "AI"}: ${m.content}`)
    .join("\n");

  const system = `あなたは WORKS ニュースサーチの相談 AI です。
必ず「本日のダイジェスト」とフォーカス記事の最新情報を根拠に答える。
一般知識だけで時事を断定しない。分からなければ「ダイジェストに無い」と明示する。
日本語・です/ます。結論を先に。400〜900字。
${USER_CONTEXT}`;

  const userPrompt = `取得日時: ${digest.fetchedAt}
ソース: ${digest.source}

${focusBlock}

## 本日のダイジェスト
${digestBrief}

${transcript ? `## これまでの会話\n${transcript}\n` : ""}
## ユーザー質問
${message}`;

  // 最新補強が必要な質問は grounding、それ以外はダイジェスト根拠の Gemini
  const wantsLive =
    /最新|いま|今日|速報|相場|首相|総理|発表|決定/.test(message) || Boolean(focus);

  let result:
    | { ok: true; text: string; model: string }
    | { ok: false; reason: string };

  if (wantsLive) {
    const grounded = await generateWithGoogleSearch({
      system,
      userPrompt: `${userPrompt}\n必要なら Google 検索で直近事実を確認し、ダイジェストと矛盾する古い話は捨てる。`,
      timeoutMs: CHAT_TIMEOUT_MS,
      preferFast: true,
      maxOutputTokens: 1200,
    });
    if (grounded.ok) result = grounded;
    else {
      result = await generateWithGemini(
        {
          system,
          messages: [{ role: "user", content: userPrompt }],
          maxOutputTokens: 1200,
          temperature: 0.35,
        },
        { timeoutMs: CHAT_TIMEOUT_MS, maxAttempts: 2 },
      );
    }
  } else {
    result = await generateWithGemini(
      {
        system,
        messages: [{ role: "user", content: userPrompt }],
        maxOutputTokens: 1200,
        temperature: 0.35,
      },
      { timeoutMs: CHAT_TIMEOUT_MS, maxAttempts: 2 },
    );
  }

  if (!result.ok) return result;

  await recordTokenUsage({
    userId: options.userId,
    feature: "works-news-search-chat",
    model: result.model,
    promptTokens: approxTokens(userPrompt),
    completionTokens: approxTokens(result.text),
  });

  return { ok: true, reply: result.text.trim(), model: result.model };
}
