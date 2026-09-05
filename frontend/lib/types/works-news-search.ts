export type NewsSearchCategory =
  | "ai"
  | "systems"
  | "economy"
  | "government";

export const NEWS_SEARCH_CATEGORIES: readonly NewsSearchCategory[] = [
  "ai",
  "systems",
  "economy",
  "government",
] as const;

export const NEWS_SEARCH_CATEGORY_LABEL: Record<NewsSearchCategory, string> = {
  ai: "AI ニュース",
  systems: "システム開発",
  economy: "世界経済",
  government: "官公庁",
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

export type NewsSearchDigest = {
  id: string;
  fetchedAt: string;
  source: "rss+gemini" | "rss" | "mixed";
  categories: Record<NewsSearchCategory, NewsSearchItem[]>;
  solunaSynced: boolean;
  summary: string;
};

export type NewsSearchChatMessage = {
  role: "user" | "assistant";
  content: string;
};
