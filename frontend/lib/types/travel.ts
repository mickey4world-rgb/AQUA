/** Travel 資料（電子ファイル）・RAG チャンク */

export type TravelMaterialKind = "pdf" | "text" | "image" | "docx" | "other";

export type TravelMaterialExtractMethod =
  | "pdfjs"
  | "text"
  | "docx"
  | "gemini-ocr"
  | "gemini-pdf"
  | "openai-ocr";

export interface TravelMaterialChunk {
  id: string;
  index: number;
  text: string;
  /** 1-based page when known */
  pageHint?: number;
}

export interface TravelMaterial {
  id: string;
  fileName: string;
  mimeType: string;
  kind: TravelMaterialKind;
  byteSize: number;
  extractedChars: number;
  chunkCount: number;
  chunks: TravelMaterialChunk[];
  excerpt: string;
  extractMethod: TravelMaterialExtractMethod;
  createdAt: string;
}

export type TravelStopKind =
  | "sight"
  | "meal"
  | "hotel"
  | "transport"
  | "free"
  | "other";

/** 移動の乗り物（地図・一覧で可愛く見せる） */
export type TravelTransportMode =
  | "walk"
  | "train"
  | "bus"
  | "car"
  | "taxi"
  | "plane"
  | "ship"
  | "bike"
  | "other";

export type TravelWeatherSource = "archive" | "forecast";

/** 地点×旅行日の天気・環境（過去は archive＝実測系を永続） */
export interface TravelStopWeather {
  date: string;
  source: TravelWeatherSource;
  label: string;
  weatherCode?: number;
  tempMaxC?: number;
  tempMinC?: number;
  humidityPct?: number;
  precipMm?: number;
  precipProbPct?: number;
  windMaxKmh?: number;
  uvIndexMax?: number;
  fetchedAt: string;
}

export interface TravelStop {
  id: string;
  dayIndex: number;
  order: number;
  name: string;
  kind: TravelStopKind;
  /** ISO date YYYY-MM-DD or empty */
  date?: string;
  /** HH:mm local */
  timeLabel?: string;
  address?: string;
  lat?: number;
  lon?: number;
  note?: string;
  /** 移動手段（kind=transport や区間表現用） */
  transportMode?: TravelTransportMode;
  /** 旅行会社資料から抽出した原文メモ */
  sourceSnippet?: string;
  /** 外部／AI 提案 */
  tip?: string;
  recommendReason?: string;
  externalUrl?: string;
  /** 旅行日時に合わせた天気・環境（過去は実情報を保管） */
  weather?: TravelStopWeather;
}

export interface TravelJournalEntry {
  id: string;
  createdAt: string;
  body: string;
  stopId?: string;
  /** data URL（容量制限あり） */
  photoDataUrl?: string;
  photoByteSize?: number;
}

export interface TravelTrip {
  id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  summary?: string;
  stops: TravelStop[];
  journal: TravelJournalEntry[];
  /** アップロード資料（チャンク保管・RAG 用。原本バイナリは持たない） */
  materials?: TravelMaterial[];
  sourceMaterialExcerpt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelTripListItem {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  stopCount: number;
  journalCount: number;
  materialCount?: number;
  updatedAt: string;
}

export interface CreateTravelTripRequest {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  summary?: string;
}

export interface UpdateTravelTripRequest {
  title?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  stops?: TravelStop[];
}

export interface AddTravelStopRequest {
  name: string;
  kind?: TravelStopKind;
  dayIndex?: number;
  order?: number;
  date?: string;
  timeLabel?: string;
  address?: string;
  note?: string;
  transportMode?: TravelTransportMode;
  /** 地名検索クエリ（空なら name + address） */
  geocodeQuery?: string;
  lat?: number;
  lon?: number;
}

export interface TravelMaterialUploadFile {
  name: string;
  mimeType?: string;
  /** raw base64（data URL 可） */
  base64: string;
}
