/** サンプル PowerPoint テーマに合わせた青色ベースの資料デザイン */

export const DOCS_THEME = {
  /** ダークネイビー（ヘッダー・表紙背景） */
  navy: "0E2841",
  /** ティールブルー（アクセント・強調） */
  teal: "156082",
  /** スレートブルー（枠線・サブ要素） */
  slate: "467886",
  /** シアン（ライン・ハイライト） */
  cyan: "0BD0D9",
  /** ミント（薄い図形背景） */
  mint: "9DD4CF",
  /** ライトグレー（パネル背景） */
  panel: "E8E8E8",
  /** ペールブルー（図形フィル） */
  pale: "D6EAF5",
  /** ホワイト */
  white: "FFFFFF",
  /** 本文テキスト */
  text: "1A1A1A",
  /** サブテキスト */
  muted: "467886",
  /** 図解用ブルーグラデーション（濃→淡） */
  blues: ["0E2841", "156082", "0F9ED5", "0BD0D9", "9DD4CF"] as const,
} as const;

export const DOCS_FONT = "Yu Gothic UI";
