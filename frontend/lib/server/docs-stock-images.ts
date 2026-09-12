/**
 * Docs PPTX 向けストック画像解決。
 * 主経路: Pexels / Unsplash（キーがあれば）→ Wikimedia 検索 → picsum
 * 最終フォールバック: バンドル抽象 PNG（ネットワーク無しでも必ず1枚）
 *
 * 不変条件: image 指定スライドでは、解決結果が null にならない。
 */

import { DOCS_STOCK_FALLBACK_PNG } from "@/lib/server/docs-stock-fallbacks";

export type DocsResolvedImage = {
  data: string; // base64（data: なし）
  ext: "jpg" | "png" | "jpeg" | "webp";
  source: "pexels" | "unsplash" | "wikimedia" | "picsum" | "bundled";
  credit?: string;
};

const FETCH_MS = 4000;
const MAX_BYTES = 2_500_000;

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 10_000) + 1;
}

function pickTheme(query: string): keyof typeof DOCS_STOCK_FALLBACK_PNG {
  const q = query.toLowerCase();
  if (/team|people|meeting|office|work|会議|チーム|協働/.test(q)) return "team";
  if (/tech|digital|ai|data|cloud|software|システム|dx|it/.test(q))
    return "technology";
  if (/city|urban|skyline|東京|都市/.test(q)) return "city";
  if (/nature|green|ocean|forest|自然/.test(q)) return "nature";
  if (/abstract|space|earth|宇宙|抽象/.test(q)) return "abstract";
  return "business";
}

function fromBundled(query: string): DocsResolvedImage {
  const theme = pickTheme(query);
  const data = DOCS_STOCK_FALLBACK_PNG[theme] ?? DOCS_STOCK_FALLBACK_PNG.business;
  return {
    data,
    ext: "png",
    source: "bundled",
    credit: "AQUA Docs abstract",
  };
}

async function fetchAsImage(
  url: string,
  source: DocsResolvedImage["source"],
  credit?: string,
): Promise<DocsResolvedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AQUA-DocsStudio/1.0 (internal; docs-pptx image)",
        Accept: "image/*,*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;
    // HTML エラーページを画像扱いにしない
    if (buf[0] === 0x3c /* < */) return null;
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    let ext: DocsResolvedImage["ext"] = "jpg";
    if (ctype.includes("png") || url.includes(".png")) ext = "png";
    else if (ctype.includes("webp") || url.includes(".webp")) ext = "webp";
    else if (ctype.includes("jpeg") || ctype.includes("jpg") || url.includes(".jpg"))
      ext = "jpg";
    else if (url.includes(".jpeg")) ext = "jpeg";
    else if (buf[0] === 0x89 && buf[1] === 0x50) ext = "png";
    return { data: buf.toString("base64"), ext, source, credit };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromPexels(query: string): Promise<DocsResolvedImage | null> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: key, "User-Agent": "AQUA-DocsStudio/1.0" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      photos?: { src?: { large?: string; medium?: string }; photographer?: string }[];
    };
    const photo = json.photos?.[0];
    const imgUrl = photo?.src?.large ?? photo?.src?.medium;
    if (!imgUrl) return null;
    return fetchAsImage(imgUrl, "pexels", photo?.photographer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromUnsplash(query: string): Promise<DocsResolvedImage | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Client-ID ${key}`,
        "User-Agent": "AQUA-DocsStudio/1.0",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { urls?: { regular?: string; small?: string }; user?: { name?: string } }[];
    };
    const photo = json.results?.[0];
    const imgUrl = photo?.urls?.regular ?? photo?.urls?.small;
    if (!imgUrl) return null;
    return fetchAsImage(imgUrl, "unsplash", photo?.user?.name);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromWikimedia(query: string): Promise<DocsResolvedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const api =
      "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: `filetype:bitmap ${query}`,
        gsrnamespace: "6",
        gsrlimit: "5",
        prop: "imageinfo",
        iiprop: "url|mime|size",
        iiurlwidth: "960",
        format: "json",
        origin: "*",
      }).toString();
    const res = await fetch(api, {
      signal: controller.signal,
      headers: { "User-Agent": "AQUA-DocsStudio/1.0 (docs-pptx; aqua)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            imageinfo?: {
              thumburl?: string;
              url?: string;
              mime?: string;
              size?: number;
            }[];
            title?: string;
          }
        >;
      };
    };
    const pages = Object.values(json.query?.pages ?? {});
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const mime = (info?.mime ?? "").toLowerCase();
      if (mime && !mime.startsWith("image/")) continue;
      const fileName = (page.title ?? "").replace(/^File:/i, "");
      if (!fileName) continue;
      // Special:Redirect 経由で許可サイズの thumb を取得
      const redirectUrl =
        "https://commons.wikimedia.org/wiki/Special:FilePath/" +
        encodeURIComponent(fileName) +
        "?width=960";
      const got = await fetchAsImage(redirectUrl, "wikimedia", "Wikimedia Commons");
      if (got) return got;
      const imgUrl = info?.thumburl ?? info?.url;
      if (imgUrl) {
        const direct = await fetchAsImage(imgUrl, "wikimedia", "Wikimedia Commons");
        if (direct) return direct;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromPicsum(query: string): Promise<DocsResolvedImage | null> {
  const seed = hashSeed(query);
  return fetchAsImage(
    `https://picsum.photos/seed/aqua-docs-${seed}/1200/800.jpg`,
    "picsum",
    "Picsum Photos",
  );
}

/** クエリから1枚解決。最終的にバンドル PNG を返す（null にしない）。 */
export async function resolveDocsStockImage(query: string): Promise<DocsResolvedImage> {
  const q = query.trim().slice(0, 80) || "modern business";

  const chain: Array<() => Promise<DocsResolvedImage | null>> = [
    () => fromPexels(q),
    () => fromUnsplash(q),
    () => fromWikimedia(q),
    () => fromPicsum(q),
  ];

  for (const step of chain) {
    const img = await step();
    if (img) return img;
  }
  return fromBundled(q);
}

export type DocsSlideImageRequest = {
  slideIndex: number;
  query: string;
};

/** 最大枚数を並列解決（SWA タイムアウト予算内） */
export async function resolveDocsStockImages(
  requests: DocsSlideImageRequest[],
  maxImages = 4,
): Promise<Map<number, DocsResolvedImage>> {
  const limited = requests.slice(0, maxImages);
  const settled = await Promise.all(
    limited.map(async (req) => {
      const img = await resolveDocsStockImage(req.query);
      return { index: req.slideIndex, img };
    }),
  );
  const map = new Map<number, DocsResolvedImage>();
  for (const row of settled) {
    map.set(row.index, row.img);
  }
  return map;
}

export function ensureOutlineImages(outline: {
  documentTitle: string;
  slides: {
    layout: string;
    title: string;
    visual?: unknown;
    image?: { query: string; placement?: "hero" | "side" };
  }[];
}): void {
  const title = outline.slides[0];
  if (title && title.layout === "title" && !title.image?.query) {
    title.image = {
      query: "modern business skyline dusk",
      placement: "hero",
    };
  }

  let added = 0;
  for (const slide of outline.slides) {
    if (added >= 2) break;
    if (slide.layout !== "content") continue;
    if (slide.image?.query) continue;
    if (slide.visual) continue;
    slide.image = {
      query: `${slide.title} professional workplace`.replace(/[^\w\s\-]/g, " ").slice(0, 60),
      placement: "side",
    };
    added += 1;
  }
}
