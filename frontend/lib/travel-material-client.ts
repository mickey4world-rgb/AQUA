/**
 * ブラウザ側で旅行資料を読み、API へ送るペイロードを小さくする。
 * SWA の巨大 JSON（PDF base64）は黙って失敗しやすいため、本文抽出を優先する。
 */
import { compressImageForSolunaUpload } from "@/lib/soluna-image-compress";

export const TRAVEL_UPLOAD_ACCEPT =
  ".pdf,.docx,.txt,.md,.csv,.html,image/jpeg,image/png,image/webp,application/pdf";

/** SWA / API 向けに安全な目安（base64 JSON 込み） */
export const TRAVEL_UPLOAD_MAX_PAYLOAD_CHARS = 1_800_000;

export type TravelClientUploadPayload = {
  name: string;
  mimeType?: string;
  /** クライアントで抽出済み本文（こちらを優先） */
  extractedText?: string;
  extractMethodHint?: "pdfjs-client" | "text-client" | "docx-client";
  /** 画像などサーバー OCR が必要なときだけ */
  base64?: string;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

async function readFileAsBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function extractPdfTextInBrowser(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 40);
  for (let p = 1; p <= maxPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const line = content.items
      .map((item) => ("str" in item ? String((item as { str?: string }).str ?? "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(`【p${p}】\n${line}`);
  }
  return parts.join("\n\n");
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("このブラウザでは DOCX 展開に未対応です");
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function extractDocxTextInBrowser(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (offset + 30 <= buf.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = buf.subarray(offset + 30, offset + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    let raw: Uint8Array;
    if (method === 0) raw = data;
    else if (method === 8) raw = await inflateRaw(data);
    else {
      offset = dataStart + compSize;
      continue;
    }
    entries.set(name, raw);
    offset = dataStart + compSize;
  }
  const xml = entries.get("word/document.xml");
  if (!xml) throw new Error("DOCX の本文が見つかりません");
  const xmlText = new TextDecoder().decode(xml);
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlText))) {
    if (m[1]) texts.push(m[1]);
  }
  return texts.join("").replace(/\s+/g, " ").trim();
}

/**
 * 1 ファイルを API 向けペイロードに変換。進捗コールバックで UI 表示用。
 */
export async function prepareTravelUploadFile(
  file: File,
  onStatus?: (message: string) => void,
): Promise<TravelClientUploadPayload> {
  const name = file.name || "material";
  const ext = extOf(name);
  const mime = (file.type || "").toLowerCase();

  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "html" || ext === "htm" || mime.startsWith("text/")) {
    onStatus?.(`${name}: テキスト読み取り中…`);
    const extractedText = await readFileAsText(file);
    if (extractedText.replace(/\s/g, "").length < 20) {
      throw new Error(`${name}: 読み取れる本文が少なすぎます`);
    }
    return {
      name,
      mimeType: mime || "text/plain",
      extractedText,
      extractMethodHint: "text-client",
    };
  }

  if (ext === "pdf" || mime === "application/pdf") {
    onStatus?.(`${name}: PDF を解析中…`);
    try {
      const extractedText = await extractPdfTextInBrowser(file);
      if (extractedText.replace(/\s/g, "").length >= 40) {
        return {
          name,
          mimeType: "application/pdf",
          extractedText,
          extractMethodHint: "pdfjs-client",
        };
      }
      onStatus?.(`${name}: 文字が少ないため画像OCR用に送ります（大きいPDFは失敗し得ます）…`);
    } catch (err) {
      console.warn("[travel-upload] client pdf extract failed", err);
      onStatus?.(`${name}: ブラウザ解析に失敗。サーバーへ転送を試行…`);
    }
    if (file.size > 2_800_000) {
      throw new Error(
        `${name}: スキャンPDFが大きく、文字も抽出できませんでした。テキスト付きPDFか、ページ画像（JPG）で送ってください。`,
      );
    }
    return {
      name,
      mimeType: "application/pdf",
      base64: await readFileAsBase64(file),
    };
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    onStatus?.(`${name}: DOCX を解析中…`);
    const extractedText = await extractDocxTextInBrowser(file);
    if (extractedText.replace(/\s/g, "").length < 20) {
      throw new Error(`${name}: DOCX から本文を取れませんでした`);
    }
    return {
      name,
      mimeType: mime || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extractedText,
      extractMethodHint: "docx-client",
    };
  }

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    onStatus?.(`${name}: 画像を圧縮中…`);
    const compressed = await compressImageForSolunaUpload(file, 750_000);
    const b64 = compressed.dataUrl.replace(/^data:[^;]+;base64,/, "");
    return {
      name,
      mimeType: "image/jpeg",
      base64: b64,
    };
  }

  throw new Error(`${name}: 未対応形式です（PDF / DOCX / TXT / JPG・PNG）`);
}

export function assertTravelUploadPayloadSize(files: TravelClientUploadPayload[]) {
  const size = JSON.stringify({ files }).length;
  if (size > TRAVEL_UPLOAD_MAX_PAYLOAD_CHARS) {
    throw new Error(
      `送信データが大きすぎます（約 ${Math.round(size / 1024)}KB）。より小さいファイルか、テキスト付きPDFにしてください。`,
    );
  }
}

export async function readApiErrorMessage(
  res: Response,
  fallbackLabel = "リクエスト",
): Promise<string> {
  const text = await res.text();
  if (!text) {
    if (res.status === 500 || res.status === 504 || res.status === 502) {
      return `${fallbackLabel}がサーバー側で中断されました（HTTP ${res.status}）。時間のかかる処理がタイムアウトした可能性があります。もう一度お試しください。`;
    }
    return `${fallbackLabel}に失敗しました（HTTP ${res.status}）`;
  }
  try {
    const data = JSON.parse(text) as { error?: string; requestId?: string };
    if (data.error) {
      return data.requestId ? `${data.error}（id: ${data.requestId}）` : data.error;
    }
  } catch {
    // HTML / plain
  }
  if (res.status === 413 || /request entity too large|payload/i.test(text)) {
    return "ファイルが大きすぎてサーバーが受け取れませんでした。小さいファイルかテキスト付きPDFで再試行してください。";
  }
  if (res.status === 401 || res.status === 302) {
    return "ログインが必要です。再ログインしてから操作してください。";
  }
  if (res.status === 500 || res.status === 504 || res.status === 502) {
    return `${fallbackLabel}がサーバー側で失敗しました（HTTP ${res.status}）。再試行するか、資料を短くしてから判読してください。`;
  }
  return `${fallbackLabel}に失敗しました（HTTP ${res.status}）`;
}
