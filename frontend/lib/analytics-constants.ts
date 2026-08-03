import type { AppKey } from "@/lib/types/access-log";

export const APP_LABELS: Record<AppKey, string> = {
  stocks: "保有株",
  disney: "ディズニー",
  costs: "コスト分析",
  council: "AI 合議",
  docs: "資料生成",
  users: "ユーザー",
  system: "システム",
};

export const FEATURE_LABELS: Record<string, string> = {
  "stock-analysis": "保有株 AI アドバイス",
  "disney-suggest": "ディズニー AI ガイド",
  "disney-chat": "ディズニー ミッキーチャット",
  "council-initial-logic": "合議 初見（論理）",
  "council-initial-creative": "合議 初見（発想）",
  "council-initial-skeptic": "合議 初見（懐疑）",
  "council-rebuttal-logic": "合議 議論（論理）",
  "council-rebuttal-creative": "合議 議論（発想）",
  "council-rebuttal-skeptic": "合議 議論（懐疑）",
  "council-synthesis-judge": "合議 まとめ（議長）",
  "council-followup": "合議 フォローアップ",
  "docs-generate": "資料生成 pptx",
  watches: "保有株一覧",
  "watch-detail": "保有株詳細",
  lookup: "銘柄検索",
  advice: "ディズニーアドバイス",
  waits: "待ち時間",
  status: "混雑ステータス",
  calendar: "混雑カレンダー",
  dashboard: "分析ダッシュボード",
  profile: "ユーザープロファイル",
};

export const FEATURE_APP_MAP: Record<string, AppKey> = {
  "stock-analysis": "stocks",
  "disney-suggest": "disney",
  "disney-chat": "disney",
  "council-initial-logic": "council",
  "council-initial-creative": "council",
  "council-initial-skeptic": "council",
  "council-rebuttal-logic": "council",
  "council-rebuttal-creative": "council",
  "council-rebuttal-skeptic": "council",
  "council-synthesis-judge": "council",
  "council-followup": "council",
  "docs-generate": "docs",
  watches: "stocks",
  "watch-detail": "stocks",
  lookup: "stocks",
  advice: "disney",
  waits: "disney",
  status: "disney",
  calendar: "disney",
  dashboard: "costs",
  profile: "users",
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export function featureApp(feature: string): AppKey {
  return FEATURE_APP_MAP[feature] ?? "system";
}
