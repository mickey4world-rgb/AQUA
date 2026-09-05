/**
 * Soluna 画像アセット（アップロード / 無料生成 / 削除）
 * 実体は Cosmos に data URL で保管（Blob 無しでも動く）
 */
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { generateGeminiImage, generateWithGemini, isGeminiConfigured, stripJsonFence } from "@/lib/server/gemini";
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

/** 無料 Pollinations で実測応答したモデル（ベース立ち絵は Nano Banana 2 製） */
export const SOLUNA_IMAGE_MODELS: SolunaImageModelOption[] = [
  {
    id: "nanobanana-2",
    label: "Nano Banana 2",
    description: "ベース立ち絵と同じモデル（推奨）",
    styleFriendly: true,
    supportsReference: true,
  },
  {
    id: "nanobanana-2-lite",
    label: "Nano Banana 2 Lite",
    description: "同系統・やや軽量",
    styleFriendly: true,
    supportsReference: true,
  },
  {
    id: "flux",
    label: "Flux",
    description: "高品質（画風は寄りにくい）",
  },
  {
    id: "gptimage",
    label: "GPT Image",
    description: "イラスト寄り・参照対応",
    styleFriendly: true,
    supportsReference: true,
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
    id: "zimage",
    label: "Z-Image",
    description: "速い 6B 系",
  },
  {
    id: "klein",
    label: "Klein",
    description: "高速・参照対応",
    supportsReference: true,
  },
];

export const DEFAULT_SOLUNA_IMAGE_MODEL: SolunaImageModelId = "nanobanana-2";

/** Pollinations フォールバック用の短い画風トレーラー */
export const SOLUNA_BASE_STYLE_TRAILER = [
  "same Sol and Luna as reference",
  "chibi anime game icon style, circular gold frames, vibrant colors",
].join(", ");

/** Gemini 直叩き用（日本語・依頼優先） */
function composeGeminiImagePrompt(userPrompt: string, matchBaseStyle: boolean): string {
  if (!matchBaseStyle) return userPrompt.trim();
  return `${userPrompt.trim()}

参照画像のソルとルーナのキャラデザイン・ちびゲームアイコン風の画風を維持したまま、上記の場面をそのまま描いてください。依頼にない要素は追加しないでください。`;
}

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

function modelSupportsReference(model: SolunaImageModelId): boolean {
  return SOLUNA_IMAGE_MODELS.find((m) => m.id === model)?.supportsReference === true;
}

function isGeminiNativeImageModel(model: SolunaImageModelId): boolean {
  return model === "nanobanana-2" || model === "nanobanana-2-lite";
}

async function loadBaseReferenceImage(): Promise<{ mimeType: string; data: string } | null> {
  const candidates = [
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "public",
      "soluna",
      "characters-base.jpg",
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "frontend",
      "public",
      "soluna",
      "characters-base.jpg",
    ),
  ];
  for (const filePath of candidates) {
    try {
      const buffer = await readFile(filePath);
      if (buffer.byteLength < 32) continue;
      return { mimeType: "image/jpeg", data: buffer.toString("base64") };
    } catch {
      /* try next path */
    }
  }

  try {
    const res = await fetch(publicBaseImageUrl(), { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength < 32) return null;
    return {
      mimeType: contentType.split(";")[0]!.trim() || "image/jpeg",
      data: buffer.toString("base64"),
    };
  } catch {
    return null;
  }
}

function defaultStudioComments(matchBaseStyle: boolean): { solComment: string; lunaComment: string } {
  return matchBaseStyle
    ? {
        solComment: "依頼どおり、ベース画風で描くぞ！",
        lunaComment: "参照立ち絵に寄せつつ、場面はそのままね。",
      }
    : {
        solComment: "よし、この依頼どおり描くぜ！",
        lunaComment: "依頼の内容を落とさないでね。",
      };
}

function baseAsset(userId: string): SolunaImageAsset {
  const now = "2026-08-26T00:00:00.000Z";
  return {
    id: "base-sol-luna",
    userId,
    title: "ソル＆ルーナ ベース立ち絵",
    prompt: "Sol and Luna official character base illustration (Nano Banana 2)",
    source: "base",
    imageUrl: SOLUNA_BASE_IMAGE_PATH,
    mimeType: "image/jpeg",
    byteSize: 0,
    model: "nanobanana-2",
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

function composePrompt(sceneEnglish: string, matchBaseStyle: boolean): string {
  const scene = sceneEnglish.trim().replace(/\s+/g, " ");
  if (!matchBaseStyle) return scene.slice(0, 1200);
  // 依頼を先頭に置き、画風は短いトレーラーのみ（依頼が埋もれないようにする）
  return `${scene}. ${SOLUNA_BASE_STYLE_TRAILER}`.slice(0, 1200);
}

/**
 * ユーザー依頼を英語の「場面」に翻訳。画風で上書きせず、依頼を主語にする。
 */
async function enhancePromptWithGemini(
  userPrompt: string,
  matchBaseStyle: boolean,
): Promise<{
  enhancedPrompt: string;
  solComment: string;
  lunaComment: string;
}> {
  const fallbackScene = userPrompt;
  const fallback = {
    enhancedPrompt: composePrompt(fallbackScene, matchBaseStyle),
    solComment: matchBaseStyle
      ? "依頼どおり、バナナ2画風で！"
      : "よし、この依頼どおり描くぜ！",
    lunaComment: matchBaseStyle
      ? "場面は変えず、参照立ち絵に寄せてね。"
      : "依頼の内容を落とさないでね。",
  };

  if (!isGeminiConfigured()) return fallback;

  // Pollinations フォールバック時のみ英訳（Gemini 直叩きは日本語のまま依頼を尊重）
  const needsTranslate = /[\u3040-\u30ff\u4e00-\u9fff]/.test(userPrompt);
  if (!needsTranslate) return fallback;

  try {
    const result = await generateWithGemini({
      system: `あなたはソルーナ画像のプロンプト翻訳者です。
ユーザーの日本語依頼を、英語の「場面・構図・行動」説明に翻訳してください。

厳守:
1. ユーザーが頼んだ場面・行動・場所・小道具を絶対に省略・改変しない（これがプロンプトの主部）。
2. 画風やキャラ説明を invent して場面を置き換えない。
3. Sol / Luna が登場する依頼なら名前を残す。
4. enhancedPrompt には場面の英語だけを入れる（画風フレーズはサーバ側で付ける）。
5. JSONのみ:
{"scenePrompt":"english scene only","solComment":"日本語20字以内","lunaComment":"日本語20字以内"}`,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: 350,
      temperature: 0.2,
      responseMimeType: "application/json",
    });
    if (!result.ok) return fallback;
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      scenePrompt?: string;
      enhancedPrompt?: string;
      solComment?: string;
      lunaComment?: string;
    };
    const scene = (parsed.scenePrompt || parsed.enhancedPrompt || "").trim();
    if (!scene) return fallback;
    return {
      enhancedPrompt: composePrompt(scene, matchBaseStyle),
      solComment: (parsed.solComment || fallback.solComment).slice(0, 80),
      lunaComment: (parsed.lunaComment || fallback.lunaComment).slice(0, 80),
    };
  } catch {
    return fallback;
  }
}

function pollinationsConfigured(): boolean {
  return Boolean(process.env.POLLINATIONS_API_KEY?.trim());
}

async function generateWithPollinations(
  prompt: string,
  model: SolunaImageModelId,
  options?: { referenceImageUrl?: string | null },
): Promise<{ dataUrl: string; mimeType: string }> {
  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    nologo: "true",
    model,
    enhance: "false",
    seed: String(Date.now() % 1_000_000),
  });
  if (model === "nanobanana-2" || model === "nanobanana-2-lite") {
    params.set("resolution", "2k");
  }
  if (options?.referenceImageUrl) {
    params.set("image", options.referenceImageUrl);
  }

  const pollinationsKey = process.env.POLLINATIONS_API_KEY?.trim();
  if (pollinationsKey) {
    params.set("key", pollinationsKey);
  }

  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params}`;
  const headers: Record<string, string> = { Accept: "image/*" };
  if (pollinationsKey) {
    headers.Authorization = `Bearer ${pollinationsKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          pollinationsKey
            ? `Pollinations API 認証エラー（HTTP ${res.status}）。API キーを確認してください。`
            : `Pollinations の ${model} は API キーが必要です。本番では Gemini 経由を使用します。`,
        );
      }
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
 * Gemini ネイティブ（Nano Banana 2）優先 → 失敗時 Pollinations フォールバック
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
  const useReference = matchBaseStyle && modelSupportsReference(model);
  const referenceImageUrl = useReference ? publicBaseImageUrl() : null;
  const comments = defaultStudioComments(matchBaseStyle);

  let enhancedPrompt = composeGeminiImagePrompt(userPrompt, matchBaseStyle);
  let provider = "";
  let dataUrl = "";
  let mimeType = "image/jpeg";
  let geminiError: string | null = null;

  if (isGeminiNativeImageModel(model)) {
    if (!isGeminiConfigured()) {
      throw new Error(
        "Nano Banana 2 には GEMINI_RELAY（または GEMINI_API_KEY）の設定が必要です。",
      );
    }

    const referenceImage = useReference ? await loadBaseReferenceImage() : undefined;
    const gemini = await generateGeminiImage({
      prompt: enhancedPrompt,
      referenceImage: referenceImage ?? undefined,
      aspectRatio: "1:1",
    });
    if (gemini.ok) {
      dataUrl = gemini.dataUrl;
      mimeType = gemini.mimeType;
      provider = `gemini(${gemini.model})${referenceImage ? "+base-ref" : ""}`;
    } else {
      geminiError = gemini.reason;
    }
  }

  if (!dataUrl) {
    const pollinationsAllowed =
      !isGeminiNativeImageModel(model) || pollinationsConfigured();
    if (!pollinationsAllowed) {
      throw new Error(
        geminiError ??
          "Gemini 画像生成に失敗しました。GEMINI_RELAY の設定と画像モデルの利用可否を確認してください。",
      );
    }

    const pollinationsPrompt = await enhancePromptWithGemini(userPrompt, matchBaseStyle);
    enhancedPrompt = pollinationsPrompt.enhancedPrompt;
    const generated = await generateWithPollinations(enhancedPrompt, model, {
      referenceImageUrl,
    });
    dataUrl = generated.dataUrl;
    mimeType = generated.mimeType;
    const modelLabel = SOLUNA_IMAGE_MODELS.find((m) => m.id === model)?.label ?? model;
    const refNote = referenceImageUrl ? "+base-ref" : "";
    provider = `pollinations(${modelLabel})${refNote}`;
    comments.solComment = pollinationsPrompt.solComment;
    comments.lunaComment = pollinationsPrompt.lunaComment;
  }

  const image = await saveSolunaImage({
    userId,
    title: userPrompt.slice(0, 40),
    prompt: enhancedPrompt,
    source: "generate",
    dataUrl,
    model,
  });

  return {
    image,
    solComment: comments.solComment,
    lunaComment: comments.lunaComment,
    enhancedPrompt,
    provider,
    model,
  };
}

export function imageStudioMeta() {
  const geminiDirect = isGeminiConfigured();
  return {
    baseImageUrl: SOLUNA_BASE_IMAGE_PATH,
    generateConfigured: true,
    generateProvider: geminiDirect
      ? "Gemini Nano Banana 2（Google AI Studio 同系統）→ Pollinations フォールバック"
      : "Pollinations Nano Banana 2 + 場面翻訳",
    maxImages: MAX_IMAGES,
    models: SOLUNA_IMAGE_MODELS,
    defaultModel: DEFAULT_SOLUNA_IMAGE_MODEL,
    geminiDirect,
  };
}
