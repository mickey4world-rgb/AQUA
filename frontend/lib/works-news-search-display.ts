import type { NewsSearchItem } from "@/lib/types/works-news-search";

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
