export type DocSlideLayout =
  | "title"
  | "section"
  | "content"
  | "twoColumn"
  | "cards"
  | "stat"
  | "azureArch"
  | "closing";

export type DocVisualType = "flow" | "comparison" | "timeline" | "pyramid" | "icons";

export interface DocSlideVisual {
  type: DocVisualType;
  /** 図中のラベル（2〜5個） */
  labels: string[];
}

export interface DocSlideColumn {
  title: string;
  bullets: string[];
}

export interface DocSlideStat {
  value: string;
  label: string;
}

export type DocSlideImagePlacement = "hero" | "side";

/** AI が選ぶストック写真クエリ（英語推奨）。サーバが実画像を解決して PPTX に埋め込む */
export interface DocSlideImage {
  /** 検索クエリ（英語 2〜6語）。例: "modern office collaboration" */
  query: string;
  /** title/section=hero、content=side が基本 */
  placement?: DocSlideImagePlacement;
}

/** Azure 公式アイコンを使った想定クラウド構成図 */
export interface DocAzureArchNode {
  /** 図内一意 ID（edges 用） */
  id: string;
  /** 許可リストのサービスキー（例: app-service, cosmos-db） */
  service: string;
  /** 表示名（短く。例: Web / API / DB） */
  label: string;
}

export interface DocAzureArchEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DocAzureArchitecture {
  /** 図のキャプション（任意） */
  caption?: string;
  nodes: DocAzureArchNode[];
  edges?: DocAzureArchEdge[];
}

export interface DocSlideOutline {
  layout: DocSlideLayout;
  title: string;
  subtitle?: string;
  /** 1行のキーメッセージ（カード／本文のリード） */
  keyMessage?: string;
  bullets: string[];
  /** twoColumn 用 */
  columns?: DocSlideColumn[];
  /** cards 用（3〜4枚のカード見出し＝bullets、本文は短く） */
  cardDetails?: string[];
  /** stat 用 */
  stats?: DocSlideStat[];
  /** 図解・構成図（content / closing 向け） */
  visual?: DocSlideVisual;
  /** 自動挿入するストック画像 */
  image?: DocSlideImage;
  /** Azure アイコン構成図（azureArch レイアウト／content 右ペイン） */
  azureArch?: DocAzureArchitecture;
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
