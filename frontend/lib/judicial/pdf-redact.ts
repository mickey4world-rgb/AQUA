import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";

export type RedactPatternKey =
  | "email"
  | "phone"
  | "postal"
  | "address"
  | "name"
  | "company"
  | "organization";

export const PATTERN_PRESETS: Record<
  RedactPatternKey,
  { label: string; description: string; regex: RegExp }
> = {
  email: {
    label: "メールアドレス",
    description: "example@domain.co.jp など",
    regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  phone: {
    label: "電話番号",
    description: "03-1234-5678 / 09012345678 など",
    regex: /(?:0\d{1,4}[-‐−\s]?\d{1,4}[-‐−\s]?\d{3,4}|\d{10,11})/g,
  },
  postal: {
    label: "郵便番号",
    description: "〒100-0001 など",
    regex: /〒?\s?\d{3}[-‐−]?\d{4}/g,
  },
  address: {
    label: "住所",
    description: "都道府県・市区町村・番地など",
    regex:
      /(?:〒?\s?\d{3}[-‐−]?\d{4}\s*)?[\u3000-\u9fff]{2,8}[都道府県](?:[\u3000-\u9fff]+?[市区町村])?[\u3000-\u9fff\d０-９\-ー−‐丁目番地号\s]{2,56}/g,
  },
  name: {
    label: "氏名",
    description: "漢字姓名・姓 名（スペース区切り）など",
    regex:
      /(?:[一-龯々ヶ\u3400-\u9fff]{1,4}[　\s][一-龯々ヶ\u3400-\u9fff]{1,4}|[一-龯々\u3400-\u9fff]{2,4}(?:氏|様|殿|君))/g,
  },
  company: {
    label: "会社名",
    description: "株式会社・有限会社・（株）など",
    regex:
      /(?:株式会社|有限会社|合同会社|一般社団法人|一般財団法人|（株）|㈱)[\u3000-\u9fff\u3040-\u309f\u30a0-\u30ff\w\s・.-]{0,48}/g,
  },
  organization: {
    label: "組織名・官公庁",
    description: "◯◯省・◯◯庁・◯◯局・裁判所・市役所など",
    regex:
      /(?:独立行政法人|地方独立行政法人|国立[^\s、。]{1,20}|[^\s、。]{1,22}(?:省|庁|局|委員会|裁判所|検察庁|警察署|市役所|区役所|町役場|村役場|議会|公庁|本部|支局|支庁|研究所|センター|機構|協会|組合|連合|財団|社団|病院|大学|学院|学校))/g,
  },
};

export const DEFAULT_PATTERN_KEYS: RedactPatternKey[] = [
  "name",
  "address",
  "organization",
  "company",
  "email",
  "phone",
  "postal",
];

export const DEFAULT_REDACT_TERMS = `# 1行に1つずつ記載（# で始まる行はコメント）
# 企業名・住所・人名など、黒塗りしたい語句を追加してください
`;

export type RedactRect = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RedactResult = {
  pdfBytes: Uint8Array;
  matchCount: number;
  pageCount: number;
  matchesByPage: number[];
  matchedTerms: string[];
};

export type PdfInspectResult = {
  pageCount: number;
  charCount: number;
  textSample: string;
  pageSummaries: Array<{ page: number; chars: number; preview: string }>;
};

type TextSegment = {
  charStart: number;
  charEnd: number;
  x: number;
  yTop: number;
  width: number;
  height: number;
  pageIndex: number;
};

type PageText = {
  pageIndex: number;
  pageHeight: number;
  pageWidth: number;
  text: string;
  normalizedText: string;
  normToOrig: number[];
  segments: TextSegment[];
};

let pdfJsModule: typeof import("pdfjs-dist") | null = null;

function isTextItem(item: unknown): item is TextItem {
  return Boolean(item && typeof item === "object" && "str" in item);
}

export function parseCustomTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const normalized = normalizeMatchText(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(trimmed);
  }

  return terms;
}

function stripSpaces(value: string): string {
  return value.replace(/[\s\u3000]+/g, "");
}

export function normalizeMatchText(value: string): string {
  return value.normalize("NFKC");
}

function cloneBytes(fileBytes: ArrayBuffer): Uint8Array {
  return new Uint8Array(fileBytes).slice();
}

async function loadPdfJs() {
  if (pdfJsModule) return pdfJsModule;

  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  }
  pdfJsModule = pdfjs;
  return pdfjs;
}

async function openPdf(fileBytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: cloneBytes(fileBytes),
    useSystemFonts: true,
  });
  return task.promise;
}

function itemGeometry(
  item: TextItem,
  viewport: { transform: number[]; height: number },
  pdfjs: typeof import("pdfjs-dist"),
) {
  const tx = pdfjs.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.max(Math.hypot(tx[2], tx[3]), Math.hypot(tx[0], tx[1]), 8);
  const width =
    item.width > 0 ? item.width : Math.max(fontHeight * 0.5, item.str.length * fontHeight * 0.55);
  const height = fontHeight * 1.2;
  const x = tx[4];
  const baselineY = tx[5];
  const yTop = baselineY - height * 0.85;

  return { x, yTop, width, height, baselineY };
}

function buildNormalizedMap(original: string): { normalizedText: string; normToOrig: number[] } {
  let normalizedText = "";
  const normToOrig: number[] = [];

  for (let i = 0; i < original.length; i += 1) {
    const normalizedChunk = original[i]!.normalize("NFKC");
    for (let j = 0; j < normalizedChunk.length; j += 1) {
      normalizedText += normalizedChunk[j];
      normToOrig.push(i);
    }
  }

  return { normalizedText, normToOrig };
}

function buildPageText(
  items: unknown[],
  viewport: { transform: number[]; height: number; width: number },
  pageIndex: number,
  pdfjs: typeof import("pdfjs-dist"),
): PageText {
  let text = "";
  const segments: TextSegment[] = [];
  let prev: { x: number; width: number; yTop: number } | null = null;

  for (const raw of items) {
    if (!isTextItem(raw) || !raw.str) continue;

    const { x, yTop, width, height } = itemGeometry(raw, viewport, pdfjs);

    if (prev) {
      const gap = x - (prev.x + prev.width);
      const newLine = Math.abs(yTop - prev.yTop) > height * 0.45;
      if (newLine) {
        text += "\n";
      } else if (gap > height * 0.2) {
        text += " ";
      }
    }

    const charStart = text.length;
    text += raw.str;
    segments.push({
      charStart,
      charEnd: text.length,
      x,
      yTop,
      width,
      height,
      pageIndex,
    });
    prev = { x, yTop, width };
  }

  const { normalizedText, normToOrig } = buildNormalizedMap(text);

  return {
    pageIndex,
    pageHeight: viewport.height,
    pageWidth: viewport.width,
    text,
    normalizedText,
    normToOrig,
    segments,
  };
}

function findLiteralMatches(page: PageText, term: string): RedactRect[] {
  const needle = normalizeMatchText(term);
  if (!needle) return [];

  const exact = findLiteralMatchesInNormalized(page, needle);
  if (exact.length > 0) return exact;

  const compactNeedle = stripSpaces(needle);
  if (compactNeedle.length >= 2 && compactNeedle !== needle) {
    return findLiteralMatchesCompact(page, compactNeedle);
  }

  return [];
}

function findLiteralMatchesInNormalized(page: PageText, needle: string): RedactRect[] {
  const rects: RedactRect[] = [];
  let from = 0;

  while (from < page.normalizedText.length) {
    const index = page.normalizedText.indexOf(needle, from);
    if (index < 0) break;

    rects.push(...rectsFromNormalizedRange(page, index, index + needle.length));
    from = index + Math.max(1, needle.length);
  }

  return rects;
}

function buildCompactMap(text: string): { compact: string; compactToOrig: number[] } {
  let compact = "";
  const compactToOrig: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (/[\s\u3000]/.test(ch)) continue;
    const normalized = normalizeMatchText(ch);
    for (let j = 0; j < normalized.length; j += 1) {
      compact += normalized[j];
      compactToOrig.push(i);
    }
  }

  return { compact, compactToOrig };
}

/** スペースの有無を無視して語句を探す（追記語句の取りこぼし防止） */
function findLiteralMatchesCompact(page: PageText, compactNeedle: string): RedactRect[] {
  const { compact, compactToOrig } = buildCompactMap(page.text);
  const rects: RedactRect[] = [];
  let from = 0;

  while (from < compact.length) {
    const index = compact.indexOf(compactNeedle, from);
    if (index < 0) break;

    const start = compactToOrig[index] ?? 0;
    const endIndex = index + compactNeedle.length - 1;
    const end = (compactToOrig[endIndex] ?? endIndex) + 1;

    rects.push(...rectsFromRange(page.pageHeight, page.pageIndex, start, end, page.segments));
    from = index + Math.max(1, compactNeedle.length);
  }

  return rects;
}

function rectsFromNormalizedRange(page: PageText, normStart: number, normEnd: number): RedactRect[] {
  const start = page.normToOrig[normStart] ?? normStart;
  const endIndex = Math.max(normStart, normEnd - 1);
  const end = (page.normToOrig[endIndex] ?? endIndex) + 1;
  return rectsFromRange(page.pageHeight, page.pageIndex, start, end, page.segments);
}

function rectsFromRange(
  pageHeight: number,
  pageIndex: number,
  start: number,
  end: number,
  segments: TextSegment[],
): RedactRect[] {
  const rects: RedactRect[] = [];
  const padX = 2;
  const padY = 1.5;

  for (const segment of segments) {
    if (segment.charEnd <= start || segment.charStart >= end) continue;

    const overlapStart = Math.max(start, segment.charStart);
    const overlapEnd = Math.min(end, segment.charEnd);
    const span = Math.max(1, segment.charEnd - segment.charStart);
    const ratioStart = (overlapStart - segment.charStart) / span;
    const ratioEnd = (overlapEnd - segment.charStart) / span;

    const width = Math.max(2, segment.width * (ratioEnd - ratioStart) + padX * 2);
    const height = segment.height + padY * 2;
    const x = Math.max(0, segment.x + segment.width * ratioStart - padX);
    const yTop = segment.yTop - padY;
    const y = Math.max(0, pageHeight - yTop - height);

    rects.push({ pageIndex, x, y, width, height });
  }

  return rects;
}

function findRegexMatches(page: PageText, regex: RegExp): RedactRect[] {
  const rects: RedactRect[] = [];
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const matcher = new RegExp(regex.source, flags);

  for (const match of page.text.matchAll(matcher)) {
    const value = match[0];
    if (!value) continue;
    const index = match.index ?? -1;
    if (index < 0) continue;
    rects.push(
      ...rectsFromRange(
        page.pageHeight,
        page.pageIndex,
        index,
        index + value.length,
        page.segments,
      ),
    );
  }

  return rects;
}

async function extractPageTexts(pdf: PDFDocumentProxy): Promise<PageText[]> {
  const pdfjs = await loadPdfJs();
  const pages: PageText[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({ includeMarkedContent: false });
    pages.push(buildPageText(textContent.items, viewport, pageNumber - 1, pdfjs));
  }

  return pages;
}

function mergeRects(rects: RedactRect[]): RedactRect[] {
  const byPage = new Map<number, RedactRect[]>();

  for (const rect of rects) {
    const list = byPage.get(rect.pageIndex) ?? [];
    list.push(rect);
    byPage.set(rect.pageIndex, list);
  }

  const merged: RedactRect[] = [];

  for (const [pageIndex, pageRects] of byPage) {
    const sorted = [...pageRects].sort((a, b) => b.y - a.y || a.x - b.x);
    const used = new Array(sorted.length).fill(false);

    for (let i = 0; i < sorted.length; i += 1) {
      if (used[i]) continue;
      let current = { ...sorted[i] };

      for (let j = i + 1; j < sorted.length; j += 1) {
        if (used[j]) continue;
        const other = sorted[j];
        const sameLine = Math.abs(current.y - other.y) < 3 && Math.abs(current.height - other.height) < 4;
        const overlapsX =
          other.x <= current.x + current.width + 4 && other.x + other.width >= current.x - 4;

        if (sameLine && overlapsX) {
          const minX = Math.min(current.x, other.x);
          const maxX = Math.max(current.x + current.width, other.x + other.width);
          const minY = Math.min(current.y, other.y);
          const maxY = Math.max(current.y + current.height, other.y + other.height);
          current = {
            pageIndex,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
          used[j] = true;
        }
      }

      merged.push(current);
    }
  }

  return merged;
}

export async function inspectPdf(fileBytes: ArrayBuffer): Promise<PdfInspectResult> {
  const pdf = await openPdf(fileBytes);
  const pages = await extractPageTexts(pdf);
  const pageSummaries = pages.map((page) => ({
    page: page.pageIndex + 1,
    chars: page.text.length,
    preview: page.text.replace(/\s+/g, " ").trim().slice(0, 120),
  }));
  const charCount = pages.reduce((sum, page) => sum + page.text.length, 0);
  const textSample = pages
    .map((page) => page.text)
    .join("\n\n")
    .trim()
    .slice(0, 800);

  return {
    pageCount: pdf.numPages,
    charCount,
    textSample,
    pageSummaries,
  };
}

export async function redactPdf(args: {
  /** 黒塗りを描画する PDF（常に初回アップロード原本を渡す） */
  fileBytes: ArrayBuffer;
  /** @deprecated 原本と同一のため省略可 */
  textSourceBytes?: ArrayBuffer;
  customTerms: string[];
  patterns: RedactPatternKey[];
}): Promise<RedactResult> {
  const sourceBytes = args.textSourceBytes ?? args.fileBytes;
  const terms = args.customTerms.map((t) => t.trim()).filter(Boolean);

  if (terms.length === 0 && args.patterns.length === 0) {
    const pdf = await openPdf(sourceBytes);
    return {
      pdfBytes: cloneBytes(args.fileBytes),
      matchCount: 0,
      pageCount: pdf.numPages,
      matchesByPage: Array.from({ length: pdf.numPages }, () => 0),
      matchedTerms: [],
    };
  }

  const pdf = await openPdf(sourceBytes);
  const pageTexts = await extractPageTexts(pdf);
  const allRects: RedactRect[] = [];
  const matchedTerms = new Set<string>();

  for (const page of pageTexts) {
    for (const term of terms) {
      const rects = findLiteralMatches(page, term);
      if (rects.length > 0) matchedTerms.add(term);
      allRects.push(...rects);
    }
    for (const key of args.patterns) {
      const preset = PATTERN_PRESETS[key];
      const before = allRects.length;
      allRects.push(...findRegexMatches(page, preset.regex));
      if (allRects.length > before) matchedTerms.add(preset.label);
    }
  }

  const rects = mergeRects(allRects);
  const { PDFDocument, rgb } = await import("pdf-lib");

  let doc;
  try {
    doc = await PDFDocument.load(cloneBytes(args.fileBytes), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF の解析に失敗しました";
    throw new Error(`PDF を開けませんでした: ${message}`);
  }

  const pages = doc.getPages();
  const matchesByPage = Array.from({ length: pages.length }, () => 0);

  for (const rect of rects) {
    const page = pages[rect.pageIndex];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = Math.min(Math.max(0, rect.x), Math.max(0, pageWidth - 1));
    const y = Math.min(Math.max(0, rect.y), Math.max(0, pageHeight - 1));
    const width = Math.min(rect.width, pageWidth - x);
    const height = Math.min(rect.height, pageHeight - y);
    if (width <= 0 || height <= 0) continue;

    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(0, 0, 0),
      borderWidth: 0,
    });
    matchesByPage[rect.pageIndex] += 1;
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await doc.save({ useObjectStreams: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF の保存に失敗しました";
    throw new Error(`黒塗り PDF の生成に失敗しました: ${message}`);
  }

  return {
    pdfBytes,
    matchCount: rects.length,
    pageCount: pages.length,
    matchesByPage,
    matchedTerms: Array.from(matchedTerms),
  };
}

export async function suggestTermsFromPdf(fileBytes: ArrayBuffer): Promise<string[]> {
  const pdf = await openPdf(fileBytes);
  const pageTexts = await extractPageTexts(pdf);
  const suggestions = new Set<string>();

  for (const page of pageTexts) {
    for (const key of Object.keys(PATTERN_PRESETS) as RedactPatternKey[]) {
      const preset = PATTERN_PRESETS[key];
      for (const match of page.text.matchAll(preset.regex)) {
        const value = match[0]?.trim();
        if (value) suggestions.add(value);
      }
    }
  }

  return Array.from(suggestions).slice(0, 40);
}

export async function renderPdfPageToCanvas(args: {
  pdfBytes: Uint8Array;
  pageNumber: number;
  scale?: number;
}): Promise<HTMLCanvasElement> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: args.pdfBytes.slice() }).promise;
  const page = await pdf.getPage(args.pageNumber);
  const scale = args.scale ?? 1.25;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas が利用できません");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderTask = page.render({
    canvasContext: context,
    viewport,
    canvas,
  });
  await renderTask.promise;
  return canvas;
}

export function formatRedactError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "PDF の処理中に不明なエラーが発生しました";
}
