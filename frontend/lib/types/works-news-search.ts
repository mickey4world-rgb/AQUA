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
