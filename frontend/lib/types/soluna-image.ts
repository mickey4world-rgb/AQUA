export type SolunaImageSource = "upload" | "generate" | "base";

/** Pollinations 無料枠で使えるモデル ID */
export type SolunaImageModelId =
  | "nanobanana-2"
  | "nanobanana-2-lite"
  | "flux"
  | "turbo"
  | "sana"
  | "gptimage"
  | "zimage"
  | "klein";

export interface SolunaImageModelOption {
  id: SolunaImageModelId;
  label: string;
  description: string;
  /** ベース立ち絵画風寄せに向くか */
  styleFriendly?: boolean;
  /** 参照画像（image=）対応 */
  supportsReference?: boolean;
}

export interface SolunaImageAsset {
  id: string;
  userId: string;
  title: string;
  prompt?: string;
  source: SolunaImageSource;
  /** data URL (data:image/...;base64,...) または公開 URL */
  imageUrl: string;
  mimeType: string;
  byteSize: number;
  /** 生成時に使ったモデル */
  model?: string;
  /** ベース画像など削除不可 */
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SolunaImageListResponse {
  images: SolunaImageAsset[];
  baseImageUrl: string;
  generateConfigured: boolean;
  generateProvider: string;
  maxImages: number;
  models: SolunaImageModelOption[];
  defaultModel: SolunaImageModelId;
  /** Gemini ネイティブ画像生成が使えるか */
  geminiDirect?: boolean;
}

export interface SolunaImageGenerateResponse {
  image: SolunaImageAsset;
  solComment: string;
  lunaComment: string;
  enhancedPrompt: string;
  provider: string;
  model: SolunaImageModelId;
}
