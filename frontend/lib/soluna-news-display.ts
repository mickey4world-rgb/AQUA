import type { SolunaNewsItem } from "@/lib/types/soluna";
import { looksPrimarilyEnglish } from "@/lib/works-news-search-lang";

/** 討伐・Note・UI で出す見出し（日本語訳があれば優先） */
export function solunaNewsPrimaryTitle(
  item: Pick<SolunaNewsItem, "title" | "titleJa">,
): string {
  return item.titleJa?.trim() || item.title;
}

/** 討伐・Note・UI で出す要約（日本語訳があれば優先） */
export function solunaNewsPrimarySummary(
  item: Pick<SolunaNewsItem, "summary" | "summaryJa">,
): string {
  return item.summaryJa?.trim() || item.summary;
}

/** 英語原文があり日本語訳があるとき、副題として原文を添える */
export function solunaNewsSecondaryTitle(
  item: Pick<SolunaNewsItem, "title" | "titleJa">,
): string | null {
  const ja = item.titleJa?.trim();
  if (!ja) return null;
  if (ja === item.title.trim()) return null;
  if (!looksPrimarilyEnglish(item.title)) return null;
  return item.title;
}

/**
 * Note／討伐ログ用: 英語があるときは英語を先に、直後に日本語訳。
 * 依頼: 「英語の記載は後ろに日本語訳」
 */
export function formatSolunaNewsHeadlineWithJa(
  item: Pick<SolunaNewsItem, "title" | "titleJa">,
): string {
  const raw = item.title.trim();
  const ja = item.titleJa?.trim();
  if (looksPrimarilyEnglish(raw) && ja && ja !== raw) {
    return `${raw}\n　（日本語: ${ja}）`;
  }
  if (ja) return ja;
  return raw;
}

export function formatSolunaNewsSummaryWithJa(
  item: Pick<SolunaNewsItem, "summary" | "summaryJa">,
): string {
  const raw = item.summary.trim();
  const ja = item.summaryJa?.trim();
  if (!raw && !ja) return "";
  if (looksPrimarilyEnglish(raw) && ja && ja !== raw) {
    return `${raw}\n　（日本語: ${ja}）`;
  }
  return ja || raw;
}

export function solunaNewsNeedsJapanese(
  item: Pick<SolunaNewsItem, "title" | "summary" | "titleJa" | "summaryJa">,
): boolean {
  if (item.titleJa?.trim() && item.summaryJa?.trim()) return false;
  return looksPrimarilyEnglish(item.title) || looksPrimarilyEnglish(item.summary);
}
