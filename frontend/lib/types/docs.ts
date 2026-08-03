export type DocSlideLayout = "title" | "content" | "closing";

export interface DocSlideOutline {
  layout: DocSlideLayout;
  title: string;
  subtitle?: string;
  bullets: string[];
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
