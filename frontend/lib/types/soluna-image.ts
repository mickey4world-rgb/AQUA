export type SolunaImageSource = "upload" | "generate" | "base";

/** Pollinations 無料枠で使えるモデル ID */
export type SolunaImageModelId =
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
  /** 画風寄せに向くか（推奨） */
  styleFriendly?: boolean;
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
}

export interface SolunaImageGenerateResponse {
  image: SolunaImageAsset;
  solComment: string;
  lunaComment: string;
  enhancedPrompt: string;
  provider: string;
  model: SolunaImageModelId;
}
