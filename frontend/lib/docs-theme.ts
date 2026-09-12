/** Docs Studio — 爽やかめの青〜アクア基調（提案資料向け） */

export const DOCS_THEME = {
  /** クリアネイビー（ヘッダー・表紙。旧より一段明るく） */
  navy: "0F4568",
  /** アクアティール（アクセント・強調） */
  teal: "1A8CA6",
  /** ソフトスレート（枠線・サブ） */
  slate: "5BA3B5",
  /** スカイシアン（ライン・ハイライト） */
  cyan: "3DD5E0",
  /** ミントグリーン（薄い図形・副題） */
  mint: "B8EDE6",
  /** クールグレー（パネル背景） */
  panel: "F0F7F9",
  /** ペールスカイ（図形フィル） */
  pale: "E3F5FA",
  /** ホワイト */
  white: "FFFFFF",
  /** 本文テキスト */
  text: "1A2B33",
  /** サブテキスト */
  muted: "4F7F8F",
  /** 図解用グラデーション（濃→淡・爽やか） */
  blues: ["0F4568", "1A8CA6", "2BB3C9", "3DD5E0", "B8EDE6"] as const,
} as const;

export const DOCS_FONT = "Yu Gothic UI";
