import type { NewsSearchItem } from "@/lib/types/works-news-search";

/**
 * 取得時刻を JST で表示する。
 * ISO を slice すると UTC のまま「昨日 19:13」に見え、当日 04:13 JST のダイジェストと誤認される。
 */
export function formatWorksNewsFetchedAtJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** digest.id（works-news-search-YYYY-MM-DD）から JST 日付を取る */
export function worksNewsDigestJstDate(digestId: string | undefined | null): string | null {
  if (!digestId) return null;
  const m = /^works-news-search-(\d{4}-\d{2}-\d{2})$/.exec(digestId);
  return m?.[1] ?? null;
}

/** 一覧・詳細で英語原文＋日本語訳を並べる */
export function newsItemPrimaryTitle(item: Pick<NewsSearchItem, "title" | "titleJa">): string {
  return item.titleJa?.trim() || item.title;
}

export function newsItemSecondaryTitle(
  item: Pick<NewsSearchItem, "title" | "titleJa">,
): string | null {
  const ja = item.titleJa?.trim();
  if (!ja) return null;
  if (ja === item.title.trim()) return null;
  return item.title;
}

export function newsItemPrimarySummary(
  item: Pick<NewsSearchItem, "summary" | "summaryJa">,
): string {
  return item.summaryJa?.trim() || item.summary;
}
