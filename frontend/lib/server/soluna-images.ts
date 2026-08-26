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
  SolunaImageSource,
} from "@/lib/types/soluna-image";

const MAX_IMAGES = 24;
const MAX_BYTES = 900_000; // Cosmos ドキュメント余裕を見て約 900KB
const DOC_TYPE = "solunaImage";

export const SOLUNA_BASE_IMAGE_PATH = "/soluna/characters-base.jpg";

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

async function enhancePromptWithGemini(userPrompt: string): Promise<{
  enhancedPrompt: string;
  solComment: string;
  lunaComment: string;
}> {
  const fallback = {
    enhancedPrompt: [
      "chibi anime character illustration of Sol and Luna",
      "Sol: spiky brown hair, blue eye wink, blue crystal shield, sword on back, golden circular frame",
      "Luna: long purple wavy hair, purple robe, golden star headpiece, staff with blue crystal, ornate book",
      "fantasy castle soft bokeh background, sparkles, polished game icon style",
      userPrompt,
    ].join(", "),
    solComment: "よし、この雰囲気で描いてみようぜ！",
    lunaComment: "ベースの立ち絵を崩さないよう、色と輪郭は揃えてね。",
  };

  if (!isGeminiConfigured()) return fallback;

  try {
    const result = await generateWithGemini({
      system: `あなたはソルーナの画像プロンプト編集者です。ユーザー要望を、英語の画像生成プロンプト1行に圧縮してください。
必ずソル（少年勇者・茶髪・青の結晶盾）とルーナ（紫髪の賢者・星の杖と本）の公式ちび立ち絵スタイルを保つこと。
JSONのみ返す:
{"enhancedPrompt":"...","solComment":"日本語20字以内","lunaComment":"日本語20字以内"}`,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: 400,
      temperature: 0.6,
      responseMimeType: "application/json",
    });
    if (!result.ok) return fallback;
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      enhancedPrompt?: string;
      solComment?: string;
      lunaComment?: string;
    };
    if (!parsed.enhancedPrompt?.trim()) return fallback;
    return {
      enhancedPrompt: parsed.enhancedPrompt.trim().slice(0, 1200),
      solComment: (parsed.solComment || fallback.solComment).slice(0, 80),
      lunaComment: (parsed.lunaComment || fallback.lunaComment).slice(0, 80),
    };
  } catch {
    return fallback;
  }
}

async function generateWithPollinations(prompt: string): Promise<{ dataUrl: string; mimeType: string }> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1024&height=1024&nologo=true&model=flux&enhance=true&seed=${Date.now() % 1_000_000}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`無料画像API HTTP ${res.status}`);
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error("画像以外の応答が返りました");
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1000) throw new Error("生成画像が空です");
    // 大きすぎる場合は保存前に JPEG として扱う（そのまま base64）
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
): Promise<SolunaImageGenerateResponse> {
  const userPrompt = sanitizeText(rawPrompt, 800);
  if (!userPrompt) throw new Error("プロンプトを入力してください");

  const enhanced = await enhancePromptWithGemini(userPrompt);
  const { dataUrl } = await generateWithPollinations(enhanced.enhancedPrompt);
  const image = await saveSolunaImage({
    userId,
    title: userPrompt.slice(0, 40),
    prompt: enhanced.enhancedPrompt,
    source: "generate",
    dataUrl,
  });

  return {
    image,
    solComment: enhanced.solComment,
    lunaComment: enhanced.lunaComment,
    enhancedPrompt: enhanced.enhancedPrompt,
    provider: "pollinations(flux)+gemini-prompt",
  };
}

export function imageStudioMeta() {
  return {
    baseImageUrl: SOLUNA_BASE_IMAGE_PATH,
    generateConfigured: true,
    generateProvider: "Pollinations Flux（無料）+ Gemini プロンプト整形",
    maxImages: MAX_IMAGES,
  };
}
