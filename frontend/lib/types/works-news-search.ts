export type NewsSearchCategory =
  | "ai"
  | "systems"
  | "economy"
  | "government"
  | "security";

/** 収集・ログインユーザー向けの全カテゴリ */
export const NEWS_SEARCH_CATEGORIES: readonly NewsSearchCategory[] = [
  "ai",
  "systems",
  "economy",
  "government",
  "security",
] as const;

/**
 * 公開プレビュー／未ログイン向け。
 * 「セキュリティ」はログインユーザーのみ（機密性の高い話題を公開面に出さない）。
 */
export const NEWS_SEARCH_PUBLIC_CATEGORIES: readonly NewsSearchCategory[] = [
  "ai",
  "systems",
  "economy",
  "government",
] as const;

export const NEWS_SEARCH_AUTH_ONLY_CATEGORIES: readonly NewsSearchCategory[] = [
  "security",
] as const;

export const NEWS_SEARCH_CATEGORY_LABEL: Record<NewsSearchCategory, string> = {
  ai: "AI ニュース",
  systems: "システム開発",
  economy: "世界経済",
  government: "官公庁",
  security: "セキュリティ",
};

export type NewsSearchSourceRef = {
  name: string;
  url: string;
};

export type NewsSearchItem = {
  id: string;
  category: NewsSearchCategory;
  title: string;
  summary: string;
  /** 英語等の原題に対する日本語訳（ある場合のみ） */
  titleJa?: string;
  /** 英語等の要約に対する日本語訳（ある場合のみ） */
  summaryJa?: string;
  /** 深堀整理 */
  deepDive: string;
  /** 今後の予想 */
  outlook: string;
  /** 分かりやすい解説 */
  explanation: string;
  /** 官公庁・司法基盤・行政事業向けの示唆 */
  govRelevance: string;
  sources: NewsSearchSourceRef[];
  /** 注目度 0–100 */
  attentionScore: number;
  publishedAt?: string;
};

export function emptyNewsSearchCategories(): Record<
  NewsSearchCategory,
  NewsSearchItem[]
> {
  return {
    ai: [],
    systems: [],
    economy: [],
    government: [],
    security: [],
  };
}

/** 旧ダイジェストに欠けたカテゴリキーを埋める */
export function normalizeNewsSearchCategories(
  categories: Partial<Record<NewsSearchCategory, NewsSearchItem[]>> | undefined,
): Record<NewsSearchCategory, NewsSearchItem[]> {
  const next = emptyNewsSearchCategories();
  if (!categories) return next;
  for (const key of NEWS_SEARCH_CATEGORIES) {
    next[key] = Array.isArray(categories[key]) ? categories[key]! : [];
  }
  return next;
}

/** 公開面用: 認証専用カテゴリを空にする（キーは残す） */
export function toPublicNewsSearchDigest<T extends { categories: Record<NewsSearchCategory, NewsSearchItem[]> }>(
  digest: T,
): T {
  const categories = normalizeNewsSearchCategories(digest.categories);
  for (const key of NEWS_SEARCH_AUTH_ONLY_CATEGORIES) {
    categories[key] = [];
  }
  return { ...digest, categories };
}

/** pending = RSS only; partial = some categories; complete = AI 解説そろい; failed = 生成試行後も未完 */
export type NewsSearchEnrichmentStatus =
  | "pending"
  | "partial"
  | "complete"
  | "failed";

export type NewsSearchDigest = {
  id: string;
  fetchedAt: string;
  source: "rss+gemini" | "rss" | "mixed";
  categories: Record<NewsSearchCategory, NewsSearchItem[]>;
  solunaSynced: boolean;
  summary: string;
  /** AI 解説の完成度。未設定の旧ドキュメントは pending 扱い */
  enrichmentStatus?: NewsSearchEnrichmentStatus;
  enrichmentErrors?: string[];
  /** 主フィード不足で緊急ライブフィードを使った */
  usedFallback?: boolean;
  /** 収集時のフィードエラー（要約・最大数件） */
  collectionErrors?: string[];
};

export type NewsSearchChatMessage = {
  role: "user" | "assistant";
  content: string;
};
