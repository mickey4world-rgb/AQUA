import type { DocVisualType } from "@/lib/types/docs";

/** AI が回答内容に応じて選ぶ図解レイアウト */
export type ConsultVisualLayout = DocVisualType | "cards" | "highlights";

export type ConsultVisualCard = {
  title: string;
  body: string;
  tone?: "cyan" | "teal" | "violet" | "amber";
};

export type ConsultVisualHighlight = {
  label: string;
  value: string;
  caption?: string;
};

/** チャット裏側のマークアップ相当 — ビューワー描画用 */
export interface ConsultVisualDocument {
  title: string;
  subtitle?: string;
  layout: ConsultVisualLayout;
  /** flow / comparison / timeline / pyramid / icons 向け */
  labels: string[];
  cards: ConsultVisualCard[];
  highlights: ConsultVisualHighlight[];
  bullets: string[];
}

export interface WorksConsultPayload {
  reply: string;
  visual: ConsultVisualDocument | null;
  model: string;
}

export const CONSULT_VISUAL_LAYOUT_LABELS: Record<ConsultVisualLayout, string> = {
  flow: "フロー",
  comparison: "比較",
  timeline: "タイムライン",
  pyramid: "優先度",
  icons: "構成",
  cards: "カード",
  highlights: "ハイライト",
};

export function emptyConsultVisual(): ConsultVisualDocument {
  return {
    title: "",
    subtitle: "",
    layout: "cards",
    labels: [],
    cards: [],
    highlights: [],
    bullets: [],
  };
}
