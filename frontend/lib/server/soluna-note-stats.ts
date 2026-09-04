/**
 * Note 投稿実績・アクセス指標（非公式 stats API + Cosmos 原稿台帳）
 * Cookie は NOTE_COOKIE のみ。ログに出さない。
 */
import { isNotePublishConfigured, noteCreatorUrl } from "@/lib/server/soluna-note-publish";
import { listSystemNoteArticles } from "@/lib/server/soluna-system-store";
import type { SolunaOpsNoteArticleRow, SolunaOpsNoteReport } from "@/lib/types/analytics";

function noteCookie(): string | null {
  return process.env.NOTE_COOKIE?.trim() || process.env.NOTE_SESSION_COOKIE?.trim() || null;
}

function editorHeaders(cookie: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Origin: "https://note.com",
    Referer: "https://note.com/",
    Accept: "application/json, text/plain, */*",
    Cookie: cookie,
  };
}

type NotePvRow = {
  key?: string;
  note_key?: string;
  name?: string;
  title?: string;
  pv?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  price?: number;
  publish_at?: string;
  published_at?: string;
};

function pickPv(row: NotePvRow): number {
  return Number(row.pv ?? row.view_count ?? 0) || 0;
}

function pickKey(row: NotePvRow): string | null {
  return row.key || row.note_key || null;
}

async function fetchNotePvRows(filter: "monthly" | "all"): Promise<NotePvRow[]> {
  const cookie = noteCookie();
  if (!cookie) return [];

  const response = await fetch(
    `https://note.com/api/v1/stats/pv?filter=${filter}&page=1&sort=pv`,
    {
      headers: editorHeaders(cookie),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`note stats/pv HTTP ${response.status}`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    data?: NotePvRow[] | { notes?: NotePvRow[]; contents?: NotePvRow[] };
  };
  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.notes)) return data.notes;
  if (data && Array.isArray(data.contents)) return data.contents;
  return [];
}

async function fetchNoteDetailStats(noteKey: string): Promise<{
  likeCount: number | null;
  priceYen: number | null;
  publishAt: string | null;
}> {
  const cookie = noteCookie();
  if (!cookie) return { likeCount: null, priceYen: null, publishAt: null };
  try {
    const response = await fetch(`https://note.com/api/v3/notes/${encodeURIComponent(noteKey)}`, {
      headers: editorHeaders(cookie),
      cache: "no-store",
    });
    if (!response.ok) return { likeCount: null, priceYen: null, publishAt: null };
    const payload = (await response.json().catch(() => ({}))) as {
      data?: {
        like_count?: number;
        price?: number;
        publish_at?: string;
        name?: string;
      };
    };
    return {
      likeCount: typeof payload.data?.like_count === "number" ? payload.data.like_count : null,
      priceYen: typeof payload.data?.price === "number" ? payload.data.price : null,
      publishAt: payload.data?.publish_at ?? null,
    };
  } catch {
    return { likeCount: null, priceYen: null, publishAt: null };
  }
}

function inMonth(iso: string | undefined, month: string): boolean {
  if (!iso) return false;
  return iso.slice(0, 7) === month;
}

export async function buildSolunaNoteOpsReport(
  month: string,
  options?: { includeLiveStats?: boolean },
): Promise<SolunaOpsNoteReport> {
  const includeLiveStats = options?.includeLiveStats !== false;
  const articles = await listSystemNoteArticles(60);
  const monthArticles = articles.filter((a) => inMonth(a.createdAt, month));
  const publishedMonth = monthArticles.filter((a) => a.published);
  const failedMonth = monthArticles.filter((a) => !a.published && a.error);

  let pvError: string | null = null;
  let pvRows: NotePvRow[] = [];
  let monthPvTotal = 0;
  let allPvTotal = 0;

  if (includeLiveStats && isNotePublishConfigured()) {
    try {
      const [monthly, all] = await Promise.all([
        fetchNotePvRows("monthly"),
        fetchNotePvRows("all"),
      ]);
      pvRows = monthly;
      monthPvTotal = monthly.reduce((s, r) => s + pickPv(r), 0);
      allPvTotal = all.reduce((s, r) => s + pickPv(r), 0);
    } catch (err) {
      pvError = err instanceof Error ? err.message : "Note PV の取得に失敗しました";
    }
  }

  const pvByKey = new Map<string, NotePvRow>();
  for (const row of pvRows) {
    const key = pickKey(row);
    if (key) pvByKey.set(key, row);
  }

  const topFromStats: SolunaOpsNoteArticleRow[] = [];
  if (includeLiveStats) {
    // 詳細 API は件数を抑えてコストを抑える（バッチ更新時のみ）
    for (const row of pvRows.slice(0, 6)) {
      const key = pickKey(row);
      if (!key) continue;
      const detail = await fetchNoteDetailStats(key);
      topFromStats.push({
        id: key,
        title: row.name || row.title || key,
        createdAt: detail.publishAt || row.publish_at || row.published_at || null,
        published: true,
        noteKey: key,
        noteUrl: `https://note.com/n/${key}`,
        priceYen: detail.priceYen ?? row.price ?? null,
        error: null,
        viewCount: pickPv(row),
        likeCount: detail.likeCount ?? row.like_count ?? null,
        commentCount: row.comment_count ?? null,
      });
    }
  }

  const fromLedger: SolunaOpsNoteArticleRow[] = monthArticles.slice(0, 20).map((a) => {
    const stats = a.noteKey ? pvByKey.get(a.noteKey) : undefined;
    return {
      id: a.id,
      title: a.title,
      createdAt: a.createdAt,
      published: a.published,
      noteKey: a.noteKey ?? null,
      noteUrl: a.noteUrl ?? null,
      priceYen: a.priceYen,
      error: a.error ?? null,
      viewCount: stats ? pickPv(stats) : null,
      likeCount: stats?.like_count ?? null,
      commentCount: stats?.comment_count ?? null,
    };
  });

  const latestPublished =
    articles.find((a) => a.published && a.createdAt) ?? articles.find((a) => a.published) ?? null;

  const paidPublishedCount = publishedMonth.filter((a) => a.priceYen > 0).length;

  return {
    configured: isNotePublishConfigured(),
    creatorUrl: noteCreatorUrl() ?? null,
    monthPublishCount: publishedMonth.length,
    monthDraftOrFailedCount: failedMonth.length,
    monthPaidPublishCount: paidPublishedCount,
    latestPublishedAt: latestPublished?.createdAt ?? null,
    latestTitle: latestPublished?.title ?? null,
    latestNoteUrl: latestPublished?.noteUrl ?? null,
    monthViewCount: monthPvTotal || null,
    lifetimeViewCount: allPvTotal || null,
    /** note の購入数 API は公式非公開。取得できた PV/スキのみ。売上件数は未取得 */
    paidSalesCount: null,
    paidSalesNote: "有料購入件数は note 非公式 API で安定取得できないため未表示（PV・スキは取得）",
    pvError,
    articles: fromLedger,
    topByViews: topFromStats,
  };
}
