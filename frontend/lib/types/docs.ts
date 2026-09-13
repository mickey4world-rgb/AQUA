export type DocSlideLayout =
  | "title"
  | "section"
  | "content"
  | "twoColumn"
  | "cards"
  | "stat"
  | "cloudArch"
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

export type DocCloudProvider = "azure" | "aws";

/** クラウド公式アイコンを使った想定構成図 */
export interface DocCloudArchNode {
  /** 図内一意 ID（edges 用） */
  id: string;
  /** 許可リストのサービスキー */
  service: string;
  /** 表示名（短く。例: Web / API / DB） */
  label: string;
  /** 月額想定（円）。省略時はサーバ側カタログで補完 */
  monthlyCostJpy?: number;
}

export interface DocCloudArchEdge {
  from: string;
  to: string;
  label?: string;
}

/**
 * 構成図の領域枠（VNet / VPC / Private Endpoint グループ等）。
 * 参照: ネットワーク境界を「箱」で見せるプロ向け構成図。
 */
export type DocCloudArchZoneKind =
  | "edge"
  | "vnet"
  | "vpc"
  | "subnet"
  | "private"
  | "mgmt"
  | "group";

export interface DocCloudArchZone {
  id: string;
  /** 枠タイトル（例: 本番 VNet / Private Endpoint） */
  label: string;
  kind?: DocCloudArchZoneKind;
  /** この枠に直接置くノード ID */
  nodeIds: string[];
  /** 入れ子の子領域 ID（親枠の内側に描画） */
  childZoneIds?: string[];
}

export interface DocCloudArchitecture {
  provider: DocCloudProvider;
  /** 図のキャプション（任意） */
  caption?: string;
  nodes: DocCloudArchNode[];
  edges?: DocCloudArchEdge[];
  /**
   * 領域枠。詳細ネットワーク時は VNet/VPC を必ず含める。
   * 省略時はサーバがサービス種別から推論する。
   */
  zones?: DocCloudArchZone[];
  /** 合計月額（円）。サーバ再計算で上書き */
  totalMonthlyJpy?: number;
  /** 費用注記 */
  costNote?: string;
}

/** @deprecated cloudArch を使用。後方互換用エイリアス */
export type DocAzureArchNode = DocCloudArchNode;
/** @deprecated */
export type DocAzureArchEdge = DocCloudArchEdge;
/** @deprecated */
export type DocAzureArchitecture = DocCloudArchitecture;

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
  /** クラウド構成図（Azure / AWS） */
  cloudArch?: DocCloudArchitecture;
  /** @deprecated cloudArch へ移行。パース時に吸収 */
  azureArch?: DocCloudArchitecture;
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
