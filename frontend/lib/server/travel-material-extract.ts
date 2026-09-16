/**
 * 旅行会社電子資料 → テキスト抽出 → チャンク化
 * PDF: pdfjs / スキャン薄い場合 Gemini PDF
 * 画像: Gemini OCR（失敗時 OpenAI vision があれば）
 * テキスト: UTF-8
 * DOCX: ZIP 内 word/document.xml から抽出（依存追加なし）
 */
import { inflateRawSync, inflateSync } from "zlib";
import { randomUUID } from "crypto";
import {
  getAzureOpenAiCheapDeployment,
  getAzureOpenAiClient,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { isGeminiConfigured, stripJsonFence } from "@/lib/server/gemini";
import { sanitizeText } from "@/lib/server/security";
import type {
  TravelMaterial,
  TravelMaterialChunk,
  TravelMaterialExtractMethod,
  TravelMaterialKind,
} from "@/lib/types/travel";

export const TRAVEL_MATERIAL_MAX_FILES = 3;
export const TRAVEL_MATERIAL_MAX_BYTES = 4_500_000;
export const TRAVEL_MATERIAL_MAX_TOTAL_CHARS = 80_000;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const MAX_CHUNKS_PER_FILE = 40;

const TEXT_EXT = new Set(["txt", "md", "csv", "json", "html", "htm", "log"]);
const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function kindOf(name: string, mime: string): TravelMaterialKind {
  const ext = extOf(name);
  const m = (mime || "").toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (ext === "docx" || m.includes("wordprocessingml")) return "docx";
  if (IMAGE_MIME.has(m) || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    return "image";
  }
  if (TEXT_EXT.has(ext) || m.startsWith("text/")) return "text";
  return "other";
}

export function chunkText(raw: string): TravelMaterialChunk[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  if (!text) return [];
  const chunks: TravelMaterialChunk[] = [];
  let i = 0;
  let index = 0;
  while (i < text.length && chunks.length < MAX_CHUNKS_PER_FILE) {
    const end = Math.min(text.length, i + CHUNK_SIZE);
    let slice = text.slice(i, end);
    if (end < text.length) {
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf("。"),
      );
      if (breakAt > CHUNK_SIZE * 0.4) {
        slice = slice.slice(0, breakAt + 1);
      }
    }
    const cleaned = sanitizeText(slice, CHUNK_SIZE + 80);
    if (cleaned.trim()) {
      chunks.push({
        id: randomUUID(),
        index,
        text: cleaned.trim(),
      });
      index += 1;
    }
    if (slice.length === 0) break;
    i += Math.max(1, slice.length - CHUNK_OVERLAP);
  }
  return chunks;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const parts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 40);
  for (let p = 1; p <= maxPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const line = content.items
      .map((item) => ("str" in item ? String(item.str ?? "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(`【p${p}】\n${line}`);
  }
  return parts.join("\n\n");
}

/** Minimal ZIP reader for DOCX (stored / deflate) */
function unzipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    let raw: Buffer;
    if (method === 0) {
      raw = Buffer.from(data);
    } else if (method === 8) {
      try {
        raw = inflateRawSync(data);
      } catch {
        raw = inflateSync(data);
      }
    } else {
      offset = dataStart + compSize;
      continue;
    }
    if (uncompSize && raw.length > uncompSize) {
      raw = raw.subarray(0, uncompSize);
    }
    out.set(name, raw);
    offset = dataStart + compSize;
  }
  return out;
}

function extractDocxText(bytes: Uint8Array): string {
  const entries = unzipEntries(Buffer.from(bytes));
  const xml = entries.get("word/document.xml");
  if (!xml) throw new Error("DOCX の本文（document.xml）が見つかりません");
  const xmlText = xml.toString("utf8");
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlText))) {
    if (m[1]) texts.push(m[1]);
  }
  return texts.join("").replace(/\s+/g, " ").trim();
}

async function ocrWithGemini(input: {
  mimeType: string;
  base64: string;
  hint: string;
}): Promise<{ text: string; method: TravelMaterialExtractMethod } | null> {
  if (!isGeminiConfigured()) return null;
  // GeminiRequest is text-only in shared helper — call generate with text instruction
  // that asks model to treat following as OCR of attached description; for real
  // multimodal we use a dedicated REST call below.
  const result = await generateGeminiMultimodal({
    system:
      "あなたは旅行しおり・行程表の OCR / 読み取り助手です。画像または PDF から読める文字だけを、改行を保って書き起こしてください。推測で予定を捏造しない。JSONのみ: {\"text\":\"...\"}",
    user: input.hint,
    inline: { mimeType: input.mimeType, data: input.base64 },
  });
  if (!result) return null;
  try {
    const parsed = JSON.parse(stripJsonFence(result)) as { text?: string };
    const text = sanitizeText(parsed.text ?? "", 40_000);
    if (text.length < 20) return null;
    return {
      text,
      method: input.mimeType === "application/pdf" ? "gemini-pdf" : "gemini-ocr",
    };
  } catch {
    const text = sanitizeText(result, 40_000);
    if (text.length < 20) return null;
    return {
      text,
      method: input.mimeType === "application/pdf" ? "gemini-pdf" : "gemini-ocr",
    };
  }
}

async function generateGeminiMultimodal(input: {
  system: string;
  user: string;
  inline: { mimeType: string; data: string };
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const relayUrl = process.env.GEMINI_RELAY_URL?.trim();
  const relayKey = process.env.GEMINI_RELAY_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  const body = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: input.user },
          { inlineData: { mimeType: input.inline.mimeType, data: input.inline.data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  try {
    let res: Response;
    if (relayUrl && relayKey) {
      res = await fetch(relayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-relay-key": relayKey,
        },
        body: JSON.stringify({ model, ...body }),
      });
    } else if (apiKey) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    } else {
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? null;
  } catch {
    return null;
  }
}

async function ocrWithOpenAi(input: {
  mimeType: string;
  base64: string;
}): Promise<string | null> {
  if (!isAzureOpenAiConfigured()) return null;
  if (!input.mimeType.startsWith("image/")) return null;
  try {
    const deployment = getAzureOpenAiCheapDeployment();
    const client = getAzureOpenAiClient(deployment, "global");
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 4000,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            '旅行しおり画像の OCR。読める文字だけ書き起こす。JSON: {"text":"..."}',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "この画像の行程・観光ポイントを書き起こしてください。" },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.base64}`,
              },
            },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { text?: string };
      return sanitizeText(parsed.text ?? "", 40_000) || null;
    } catch {
      return sanitizeText(raw, 40_000) || null;
    }
  } catch {
    return null;
  }
}

function decodeBase64Payload(raw: string): { mimeHint?: string; bytes: Uint8Array; b64: string } {
  const dataUrl = /^data:([^;]+);base64,([\s\S]+)$/i.exec(raw.trim());
  if (dataUrl) {
    return {
      mimeHint: dataUrl[1],
      b64: dataUrl[2]!.replace(/\s/g, ""),
      bytes: Buffer.from(dataUrl[2]!.replace(/\s/g, ""), "base64"),
    };
  }
  const b64 = raw.replace(/\s/g, "");
  return { b64, bytes: Buffer.from(b64, "base64") };
}

function materialFromExtractedText(input: {
  name: string;
  mimeType: string;
  kind: TravelMaterialKind;
  text: string;
  method: TravelMaterialExtractMethod;
  byteSize: number;
}): TravelMaterial {
  const text = sanitizeText(input.text, TRAVEL_MATERIAL_MAX_TOTAL_CHARS);
  if (text.replace(/\s/g, "").length < 20) {
    throw new Error(`${input.name}: 読み取れる本文が少なすぎます`);
  }
  const chunks = chunkText(text);
  if (!chunks.length) {
    throw new Error(`${input.name}: チャンク化できる本文がありません`);
  }
  return {
    id: randomUUID(),
    fileName: input.name,
    mimeType: input.mimeType,
    kind: input.kind,
    byteSize: input.byteSize,
    extractedChars: text.length,
    chunkCount: chunks.length,
    chunks,
    excerpt: text.slice(0, 400),
    extractMethod: input.method,
    createdAt: new Date().toISOString(),
  };
}

export async function extractTravelMaterialFile(input: {
  name: string;
  mimeType?: string;
  base64?: string;
  extractedText?: string;
  extractMethodHint?: string;
}): Promise<TravelMaterial> {
  const name = sanitizeText(input.name, 180) || "material";
  const mimeType = (input.mimeType || "application/octet-stream").toLowerCase();
  const kind = kindOf(name, mimeType);

  const pre = sanitizeText(input.extractedText ?? "", TRAVEL_MATERIAL_MAX_TOTAL_CHARS);
  if (pre.replace(/\s/g, "").length >= 20) {
    const hint = input.extractMethodHint;
    const method: TravelMaterialExtractMethod =
      hint === "pdfjs-client" || hint === "text-client" || hint === "docx-client"
        ? hint
        : kind === "pdf"
          ? "pdfjs-client"
          : kind === "docx"
            ? "docx-client"
            : "text-client";
    return materialFromExtractedText({
      name,
      mimeType: mimeType === "application/octet-stream" ? "text/plain" : mimeType,
      kind: kind === "other" ? "text" : kind,
      text: pre,
      method,
      byteSize: Buffer.byteLength(pre, "utf8"),
    });
  }

  if (!input.base64?.trim()) {
    throw new Error(
      `${name}: 本文もファイルデータもありません。別形式で再アップロードしてください。`,
    );
  }

  const decoded = decodeBase64Payload(input.base64);
  if (decoded.bytes.byteLength < 16) {
    throw new Error(`${name}: ファイルが空です`);
  }
  if (decoded.bytes.byteLength > TRAVEL_MATERIAL_MAX_BYTES) {
    throw new Error(
      `${name}: 大きすぎます（最大約 ${Math.round(TRAVEL_MATERIAL_MAX_BYTES / 1024 / 1024)}MB）`,
    );
  }

  const resolvedMime = (input.mimeType || decoded.mimeHint || "application/octet-stream").toLowerCase();
  const resolvedKind = kindOf(name, resolvedMime);
  if (resolvedKind === "other") {
    throw new Error(
      `${name}: 未対応形式です（PDF / DOCX / TXT・MD / JPG・PNG など）`,
    );
  }

  let text = "";
  let method: TravelMaterialExtractMethod = "text";

  if (resolvedKind === "text") {
    text = Buffer.from(decoded.bytes).toString("utf8");
    method = "text";
  } else if (resolvedKind === "docx") {
    text = extractDocxText(decoded.bytes);
    method = "docx";
  } else if (resolvedKind === "pdf") {
    try {
      text = await extractPdfText(decoded.bytes);
      method = "pdfjs";
    } catch (err) {
      console.warn("[travel-material] pdfjs failed", err);
      text = "";
    }
    if (text.replace(/\s/g, "").length < 80) {
      const ocr = await ocrWithGemini({
        mimeType: "application/pdf",
        base64: decoded.b64,
        hint: "この PDF は旅行会社のしおりです。全文を書き起こしてください。",
      });
      if (ocr) {
        text = ocr.text;
        method = ocr.method;
      } else if (text.replace(/\s/g, "").length < 20) {
        throw new Error(
          `${name}: PDF から文字を抽出できませんでした（スキャンPDFは Gemini 設定が必要です）。JPG画像でのアップロードも試してください。`,
        );
      }
    }
  } else if (resolvedKind === "image") {
    const ocr =
      (await ocrWithGemini({
        mimeType: resolvedMime.startsWith("image/") ? resolvedMime : "image/jpeg",
        base64: decoded.b64,
        hint: "この画像は旅行しおりです。行程・観光ポイントを書き起こしてください。",
      })) ||
      (await ocrWithOpenAi({
        mimeType: resolvedMime.startsWith("image/") ? resolvedMime : "image/jpeg",
        base64: decoded.b64,
      }).then((t) =>
        t ? { text: t, method: "openai-ocr" as const } : null,
      ));
    if (!ocr) {
      throw new Error(
        `${name}: 画像の読み取りに失敗しました（Gemini または Vision 対応 OpenAI が必要）`,
      );
    }
    text = ocr.text;
    method = ocr.method;
  }

  return materialFromExtractedText({
    name,
    mimeType: resolvedMime,
    kind: resolvedKind,
    text,
    method,
    byteSize: decoded.bytes.byteLength,
  });
}
