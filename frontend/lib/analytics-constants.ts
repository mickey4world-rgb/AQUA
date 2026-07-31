import type { AppKey } from "@/lib/types/access-log";

export const APP_LABELS: Record<AppKey, string> = {
  stocks: "保有株",
  disney: "ディズニー",
  costs: "コスト分析",
  users: "ユーザー",
  system: "システム",
};

export const FEATURE_LABELS: Record<string, string> = {
  "stock-analysis": "保有株 AI アドバイス",
  "disney-suggest": "ディズニー AI ガイド",
  "disney-chat": "ディズニー ミッキーチャット",
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
