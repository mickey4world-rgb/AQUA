import type { NewsSearchItem } from "@/lib/types/works-news-search";

/** ラテン文字が主で日本語が少ない → 英語（または他の欧文）とみなす */
export function looksPrimarilyEnglish(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  const jp = (t.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  if (latin < 10) return false;
  return latin > jp * 2;
}

export function newsItemNeedsJapaneseTranslation(
  item: Pick<NewsSearchItem, "title" | "summary" | "titleJa" | "summaryJa">,
): boolean {
  if (item.titleJa?.trim() && item.summaryJa?.trim()) return false;
  return looksPrimarilyEnglish(item.title) || looksPrimarilyEnglish(item.summary);
}
