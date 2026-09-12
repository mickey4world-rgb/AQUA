import type { NewsSearchDigest, NewsSearchItem } from "@/lib/types/works-news-search";
import { NEWS_SEARCH_CATEGORIES } from "@/lib/types/works-news-search";

/** 注目度が高い順。同点は新しい publishedAt を先に */
export function sortNewsItemsByAttention(items: NewsSearchItem[]): NewsSearchItem[] {
  return [...items].sort((a, b) => {
    const scoreDiff = (b.attentionScore ?? 0) - (a.attentionScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

/** 全カテゴリの一覧を注目度順に正規化 */
export function withCategoriesSortedByAttention(
  digest: NewsSearchDigest,
): NewsSearchDigest {
  const categories = { ...digest.categories };
  for (const category of NEWS_SEARCH_CATEGORIES) {
    categories[category] = sortNewsItemsByAttention(categories[category] ?? []);
  }
  return { ...digest, categories };
}
