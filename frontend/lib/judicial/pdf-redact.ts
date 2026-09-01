import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";

export type RedactPatternKey = "email" | "phone" | "postal" | "company";

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
  company: {
    label: "会社名",
    description: "株式会社・有限会社・（株）など",
    regex:
      /(?:株式会社|有限会社|合同会社|一般社団法人|一般財団法人|（株）|㈱)[\u3000-\u9fff\u3040-\u309f\u30a0-\u30ff\w\s・.-]{0,48}/g,
  },
};

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
  text: string;
  segments: TextSegment[];
};

function isTextItem(item: unknown): item is TextItem {
  return Boolean(item && typeof item === "object" && "str" in item);
}

export function parseCustomTerms(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

function multiplyTransform(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function buildPageText(
  items: unknown[],
  viewport: { transform: number[]; height: number },
  pageIndex: number,
): PageText {
  let text = "";
  const segments: TextSegment[] = [];

  for (const raw of items) {
    if (!isTextItem(raw) || !raw.str) continue;

    const tx = multiplyTransform(viewport.transform, raw.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || 10;
    const width = raw.width > 0 ? raw.width : raw.str.length * fontHeight * 0.55;
    const height = fontHeight * 1.15;
    const x = tx[4];
    const yTop = tx[5] - height;

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
  }

  return {
    pageIndex,
    pageHeight: viewport.height,
    text,
    segments,
  };
}

function rectsFromRange(
  pageHeight: number,
  pageIndex: number,
  start: number,
  end: number,
  segments: TextSegment[],
): RedactRect[] {
  const rects: RedactRect[] = [];
  const padX = 1.5;
  const padY = 1;

  for (const segment of segments) {
    if (segment.charEnd <= start || segment.charStart >= end) continue;

    const overlapStart = Math.max(start, segment.charStart);
    const overlapEnd = Math.min(end, segment.charEnd);
    const span = Math.max(1, segment.charEnd - segment.charStart);
    const ratioStart = (overlapStart - segment.charStart) / span;
    const ratioEnd = (overlapEnd - segment.charStart) / span;

    const width = Math.max(2, segment.width * (ratioEnd - ratioStart) + padX * 2);
    const height = segment.height + padY * 2;
    const x = segment.x + segment.width * ratioStart - padX;
    const yTop = segment.yTop - padY;
    const y = pageHeight - yTop - height;

    rects.push({ pageIndex, x, y, width, height });
  }

  return rects;
}

function findLiteralMatches(page: PageText, term: string): RedactRect[] {
  if (!term) return [];
  const haystack = page.text;
  const rects: RedactRect[] = [];
  const needle = term;
  let from = 0;

  while (from < haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    rects.push(
      ...rectsFromRange(
        page.pageHeight,
        page.pageIndex,
        index,
        index + needle.length,
        page.segments,
      ),
    );
    from = index + Math.max(1, needle.length);
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
  const pages: PageText[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const built = buildPageText(textContent.items, viewport, pageNumber - 1);
    pages.push(built);
  }

  return pages;
}

function mergeRects(rects: RedactRect[]): RedactRect[] {
  return rects;
}

export async function redactPdf(args: {
  fileBytes: ArrayBuffer;
  customTerms: string[];
  patterns: RedactPatternKey[];
}): Promise<RedactResult> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(args.fileBytes) });
  const pdf = await loadingTask.promise;
  const pageTexts = await extractPageTexts(pdf);

  const allRects: RedactRect[] = [];

  for (const page of pageTexts) {
    for (const term of args.customTerms) {
      allRects.push(...findLiteralMatches(page, term));
    }
    for (const key of args.patterns) {
      const preset = PATTERN_PRESETS[key];
      allRects.push(...findRegexMatches(page, preset.regex));
    }
  }

  const rects = mergeRects(allRects);
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(args.fileBytes);
  const pages = doc.getPages();
  const matchesByPage = Array.from({ length: pages.length }, () => 0);

  for (const rect of rects) {
    const page = pages[rect.pageIndex];
    if (!page) continue;
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: rgb(0, 0, 0),
      borderWidth: 0,
    });
    matchesByPage[rect.pageIndex] += 1;
  }

  const pdfBytes = await doc.save();

  return {
    pdfBytes,
    matchCount: rects.length,
    pageCount: pages.length,
    matchesByPage,
  };
}

export async function suggestTermsFromPdf(fileBytes: ArrayBuffer): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileBytes) });
  const pdf = await loadingTask.promise;
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
