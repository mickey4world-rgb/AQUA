export type SolunaImageSource = "upload" | "generate" | "base";

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
}

export interface SolunaImageGenerateResponse {
  image: SolunaImageAsset;
  solComment: string;
  lunaComment: string;
  enhancedPrompt: string;
  provider: string;
}
