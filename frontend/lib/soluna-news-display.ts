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
 * 依頼: 「英語の記載は必ずその場所に日本語訳」
 * 単一行が必要な UI は format…Inline を使う。
 */
export function formatSolunaNewsHeadlineWithJa(
  item: Pick<SolunaNewsItem, "title" | "titleJa">,
): string {
  const raw = item.title.trim();
  const ja = item.titleJa?.trim();
  if (looksPrimarilyEnglish(raw) && ja && ja !== raw) {
    return `${raw}\n　（日本語: ${ja}）`;
  }
  // 英語なのに訳が無い場合は原文のみ（公開前に ensure / oracle で止める）
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

/** バトルログ・1行表示用（改行なし） */
export function formatSolunaNewsHeadlineWithJaInline(
  item: Pick<SolunaNewsItem, "title" | "titleJa">,
): string {
  return formatSolunaNewsHeadlineWithJa(item).replace(/\n\s*/g, " ");
}

export function formatSolunaNewsSummaryWithJaInline(
  item: Pick<SolunaNewsItem, "summary" | "summaryJa">,
): string {
  return formatSolunaNewsSummaryWithJa(item).replace(/\n\s*/g, " ");
}

export function solunaNewsNeedsJapanese(
  item: Pick<SolunaNewsItem, "title" | "summary" | "titleJa" | "summaryJa">,
): boolean {
  if (looksPrimarilyEnglish(item.title) && !item.titleJa?.trim()) return true;
  if (looksPrimarilyEnglish(item.summary) && !item.summaryJa?.trim()) return true;
  return false;
}

/** Note 公開前オラクル: 英語記事に訳欠落／※訳未取得が残っていないか */
export function solunaBriefingHasMissingJapanese(
  items: Array<Pick<SolunaNewsItem, "title" | "summary" | "titleJa" | "summaryJa">>,
): boolean {
  return items.some((item) => solunaNewsNeedsJapanese(item));
}
