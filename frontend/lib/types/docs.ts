export type DocSlideLayout = "title" | "content" | "closing";

export type DocVisualType = "flow" | "comparison" | "timeline" | "pyramid" | "icons";

export interface DocSlideVisual {
  type: DocVisualType;
  /** 図中のラベル（2〜5個） */
  labels: string[];
}

export interface DocSlideOutline {
  layout: DocSlideLayout;
  title: string;
  subtitle?: string;
  bullets: string[];
  /** 図解・構成図（content / closing 向け） */
  visual?: DocSlideVisual;
}

export interface DocOutline {
  documentTitle: string;
  subtitle?: string;
  author?: string;
  slides: DocSlideOutline[];
}

export type DocsChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface DocsAttachment {
  name: string;
  content: string;
  charCount: number;
}

export interface DocsGenerateResponse {
  outline: DocOutline;
  reply: string;
  pptxBase64: string;
  fileName: string;
  model: string;
  slideCount: number;
}
