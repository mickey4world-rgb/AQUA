/**
 * Soluna 画像アセット（アップロード / 無料生成 / 削除）
 * 実体は Cosmos に data URL で保管（Blob 無しでも動く）
 */
import { randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { isGeminiConfigured, generateWithGemini, stripJsonFence } from "@/lib/server/gemini";
import { sanitizeText } from "@/lib/server/security";
import type {
  SolunaImageAsset,
  SolunaImageGenerateResponse,
  SolunaImageModelId,
  SolunaImageModelOption,
  SolunaImageSource,
} from "@/lib/types/soluna-image";

const MAX_IMAGES = 24;
const MAX_BYTES = 900_000; // Cosmos ドキュメント余裕を見て約 900KB
const DOC_TYPE = "solunaImage";

export const SOLUNA_BASE_IMAGE_PATH = "/soluna/characters-base.jpg";

/** 無料 Pollinations で実測応答したモデル */
export const SOLUNA_IMAGE_MODELS: SolunaImageModelOption[] = [
  {
    id: "flux",
    label: "Flux",
    description: "高品質・画風寄せ向き（推奨）",
    styleFriendly: true,
  },
  {
    id: "turbo",
    label: "Turbo",
    description: "高速・軽め",
  },
  {
    id: "sana",
    label: "Sana",
    description: "軽量・安定",
  },
  {
    id: "gptimage",
    label: "GPT Image",
    description: "イラスト寄りの表現",
    styleFriendly: true,
  },
  {
    id: "zimage",
    label: "Z-Image",
    description: "速い 6B 系",
  },
  {
    id: "klein",
    label: "Klein",
    description: "高速・コンパクト",
  },
];

export const DEFAULT_SOLUNA_IMAGE_MODEL: SolunaImageModelId = "flux";

/** ベース立ち絵と同じちび画風に寄せる固定スタイル文（英語） */
export const SOLUNA_BASE_STYLE_LOCK = [
  "exact same art style as official Soluna base character icons",
  "polished chibi anime game avatar illustration",
  "circular gold ornate frame portrait",
  "Sol: young boy, spiky brown hair, cheerful wink, bright blue eye, blue-white tunic with brown leather straps, dark cloak, large sword on back, translucent glowing blue crystal shield",
  "Luna: young girl, long wavy purple hair, soft brown eyes, purple-gold robe with white capelet, golden star headpiece with chains, tall wooden staff with glowing blue diamond crystal, ornate purple-gold book",
  "soft fairy-tale castle bokeh background, sparkles and star light particles",
  "clean lineart, vibrant colors, cute rounded proportions, high quality digital illustration",
  "NOT photorealistic, NOT 3D render, NOT western cartoon, NOT different character designs",
].join(", ");

type StoredImage = SolunaImageAsset & { docType: typeof DOC_TYPE };

function container() {
  return getContainer(COSMOS_CONTAINERS.solunaRecords);
}

export function isSolunaImageStoreConfigured(): boolean {
  return isCosmosConfigured();
}

export function publicBaseImageUrl(): string {
  const origin = (
    process.env.PRODUCTION_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.aquacore.net"
  ).replace(/\/$/, "");
  return `${origin}${SOLUNA_BASE_IMAGE_PATH}`;
}

export function resolveImageModel(raw: unknown): SolunaImageModelId {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (SOLUNA_IMAGE_MODELS.some((m) => m.id === id)) {
    return id as SolunaImageModelId;
  }
  return DEFAULT_SOLUNA_IMAGE_MODEL;
}

function baseAsset(userId: string): SolunaImageAsset {
  const now = "2026-08-26T00:00:00.000Z";
  return {
    id: "base-sol-luna",
    userId,
    title: "ソル＆ルーナ ベース立ち絵",
    prompt: "Sol and Luna official character base illustration",
    source: "base",
    imageUrl: SOLUNA_BASE_IMAGE_PATH,
    mimeType: "image/jpeg",
    byteSize: 0,
    locked: true,
    createdAt: now,
    updatedAt: now,
  };
}

function stripDoc(doc: StoredImage): SolunaImageAsset {
  const { docType: _d, ...asset } = doc;
  return asset;
}

export async function listSolunaImages(userId: string): Promise<SolunaImageAsset[]> {
  const { resources } = await container()
    .items.query<StoredImage>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@docType", value: DOC_TYPE },
      ],
    })
    .fetchAll();

  const userImages = resources.map(stripDoc);
  return [baseAsset(userId), ...userImages.filter((i) => i.id !== "base-sol-luna")];
}

export async function countUserImages(userId: string): Promise<number> {
  const images = await listSolunaImages(userId);
  return images.filter((i) => i.source !== "base" && i.id !== "base-sol-luna").length;
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer; byteSize: number } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("画像データ形式が不正です（data URL が必要です）");
  const mimeType = match[1]!;
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.byteLength < 32) throw new Error("画像が小さすぎます");
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`画像が大きすぎます（最大約 ${Math.round(MAX_BYTES / 1024)}KB）`);
  }
  return { mimeType, buffer, byteSize: buffer.byteLength };
}

export async function saveSolunaImage(input: {
  userId: string;
  title: string;
  prompt?: string;
  source: Exclude<SolunaImageSource, "base">;
  dataUrl: string;
  model?: string;
}): Promise<SolunaImageAsset> {
  const count = await countUserImages(input.userId);
  if (count >= MAX_IMAGES) {
    throw new Error(`保存上限（${MAX_IMAGES}枚）に達しています。不要な画像を削除してください。`);
  }

  const { mimeType, byteSize } = parseDataUrl(input.dataUrl);
  const now = new Date().toISOString();
  const asset: StoredImage = {
    id: randomUUID(),
    userId: input.userId,
    title: sanitizeText(input.title, 80) || "無題の画像",
    prompt: input.prompt ? sanitizeText(input.prompt, 1200) : undefined,
    source: input.source,
    imageUrl: input.dataUrl,
    mimeType,
    byteSize,
    model: input.model,
    locked: false,
    createdAt: now,
    updatedAt: now,
    docType: DOC_TYPE,
  };
  await container().items.create(asset);
  return stripDoc(asset);
}

export async function deleteSolunaImage(userId: string, id: string): Promise<void> {
  if (id === "base-sol-luna") {
    throw new Error("ベース画像は削除できません");
  }
  try {
    const { resource } = await container().item(id, userId).read<StoredImage>();
    if (!resource || resource.docType !== DOC_TYPE) {
      throw new Error("画像が見つかりません");
    }
    if (resource.locked || resource.source === "base") {
      throw new Error("この画像は削除できません");
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes("削除") || err.message.includes("見つかり"))) {
      throw err;
    }
    throw new Error("画像が見つかりません");
  }
  await container().item(id, userId).delete();
}

async function enhancePromptWithGemini(
  userPrompt: string,
  matchBaseStyle: boolean,
): Promise<{
  enhancedPrompt: string;
  solComment: string;
  lunaComment: string;
}> {
  const stylePrefix = matchBaseStyle ? `${SOLUNA_BASE_STYLE_LOCK}, scene: ` : "";
  const fallback = {
    enhancedPrompt: `${stylePrefix}${userPrompt}`.slice(0, 1400),
    solComment: matchBaseStyle
      ? "ベースと同じ画風でいくぜ！"
      : "よし、この雰囲気で描いてみようぜ！",
    lunaComment: matchBaseStyle
      ? "立ち絵の色と輪郭は崩さないでね。"
      : "構図と光は丁寧に合わせてね。",
  };

  if (!isGeminiConfigured()) return fallback;

  try {
    const styleRule = matchBaseStyle
      ? `必須: 公式ベース立ち絵と同一のちびアイコン画風を厳守。円形金枠、ソル（茶髪・青結晶盾・剣）とルーナ（紫髪・星杖・本）のデザインを変えない。`
      : `キャラ指定があれば尊重し、綺麗なイラストにすること。`;
    const result = await generateWithGemini({
      system: `あなたはソルーナの画像プロンプト編集者です。ユーザー要望を、英語の画像生成プロンプト1行に圧縮してください。
${styleRule}
JSONのみ返す:
{"enhancedPrompt":"...","solComment":"日本語20字以内","lunaComment":"日本語20字以内"}`,
      messages: [
        {
          role: "user",
          content: matchBaseStyle
            ? `Style lock (keep verbatim fragments):\n${SOLUNA_BASE_STYLE_LOCK}\n\nUser request:\n${userPrompt}`
            : userPrompt,
        },
      ],
      maxOutputTokens: 450,
      temperature: 0.45,
      responseMimeType: "application/json",
    });
    if (!result.ok) return fallback;
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      enhancedPrompt?: string;
      solComment?: string;
      lunaComment?: string;
    };
    if (!parsed.enhancedPrompt?.trim()) return fallback;
    const enhanced = parsed.enhancedPrompt.trim();
    const withLock =
      matchBaseStyle && !enhanced.toLowerCase().includes("soluna base")
        ? `${SOLUNA_BASE_STYLE_LOCK}, ${enhanced}`
        : enhanced;
    return {
      enhancedPrompt: withLock.slice(0, 1400),
      solComment: (parsed.solComment || fallback.solComment).slice(0, 80),
      lunaComment: (parsed.lunaComment || fallback.lunaComment).slice(0, 80),
    };
  } catch {
    return fallback;
  }
}

async function generateWithPollinations(
  prompt: string,
  model: SolunaImageModelId,
): Promise<{ dataUrl: string; mimeType: string }> {
  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    nologo: "true",
    model,
    enhance: model === "flux" || model === "gptimage" ? "true" : "false",
    seed: String(Date.now() % 1_000_000),
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`無料画像API HTTP ${res.status}（model=${model}）`);
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error("画像以外の応答が返りました");
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1000) throw new Error("生成画像が空です");
    if (buf.byteLength > MAX_BYTES) {
      throw new Error("生成画像が大きすぎます。プロンプトを短くしてもう一度試してください。");
    }
    const mimeType = contentType.split(";")[0]!.trim() || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
    return { dataUrl, mimeType };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gemini でプロンプト整形 → Pollinations（無料）で画像生成 → Cosmos 保存
 */
export async function generateSolunaImage(
  userId: string,
  rawPrompt: string,
  options?: { model?: unknown; matchBaseStyle?: boolean },
): Promise<SolunaImageGenerateResponse> {
  const userPrompt = sanitizeText(rawPrompt, 800);
  if (!userPrompt) throw new Error("プロンプトを入力してください");

  const model = resolveImageModel(options?.model);
  const matchBaseStyle = options?.matchBaseStyle !== false;

  const enhanced = await enhancePromptWithGemini(userPrompt, matchBaseStyle);
  const { dataUrl } = await generateWithPollinations(enhanced.enhancedPrompt, model);
  const image = await saveSolunaImage({
    userId,
    title: userPrompt.slice(0, 40),
    prompt: enhanced.enhancedPrompt,
    source: "generate",
    dataUrl,
    model,
  });

  const modelLabel = SOLUNA_IMAGE_MODELS.find((m) => m.id === model)?.label ?? model;
  return {
    image,
    solComment: enhanced.solComment,
    lunaComment: enhanced.lunaComment,
    enhancedPrompt: enhanced.enhancedPrompt,
    provider: `pollinations(${modelLabel})+gemini-prompt`,
    model,
  };
}

export function imageStudioMeta() {
  return {
    baseImageUrl: SOLUNA_BASE_IMAGE_PATH,
    generateConfigured: true,
    generateProvider: "Pollinations（無料）+ Gemini プロンプト整形",
    maxImages: MAX_IMAGES,
    models: SOLUNA_IMAGE_MODELS,
    defaultModel: DEFAULT_SOLUNA_IMAGE_MODEL,
  };
}
