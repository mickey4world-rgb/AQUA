import pptxgen from "pptxgenjs";
import { sanitizeFileName } from "@/lib/docs-utils";
import type { DocOutline, DocSlideOutline } from "@/lib/types/docs";

const COLORS = {
  navy: "1B2A4A",
  blue: "2563EB",
  sky: "3B82F6",
  light: "E0E7FF",
  white: "FFFFFF",
  text: "1E293B",
  muted: "64748B",
  accent: "60A5FA",
} as const;

function addTitleSlide(pptx: pptxgen, slide: DocSlideOutline, outline: DocOutline) {
  const s = pptx.addSlide();
  s.background = { color: COLORS.navy };

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.15,
    h: "100%",
    fill: { color: COLORS.blue },
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 4.8,
    w: "100%",
    h: 0.08,
    fill: { color: COLORS.accent },
  });

  s.addText(outline.documentTitle, {
    x: 0.7,
    y: 1.6,
    w: 8.5,
    h: 1.2,
    fontSize: 34,
    bold: true,
    color: COLORS.white,
    fontFace: "Yu Gothic UI",
  });

  const sub = slide.subtitle ?? outline.subtitle ?? "";
  if (sub) {
    s.addText(sub, {
      x: 0.7,
      y: 2.9,
      w: 8.5,
      h: 0.8,
      fontSize: 18,
      color: COLORS.light,
      fontFace: "Yu Gothic UI",
    });
  }

  const meta = [outline.author, new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("  ·  ");
  if (meta) {
    s.addText(meta, {
      x: 0.7,
      y: 5.0,
      w: 8.5,
      h: 0.4,
      fontSize: 11,
      color: COLORS.accent,
      fontFace: "Yu Gothic UI",
    });
  }
}

function addContentSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
  closing = false,
) {
  const s = pptx.addSlide();
  s.background = { color: closing ? COLORS.navy : COLORS.white };

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.85,
    fill: { color: closing ? COLORS.blue : COLORS.navy },
  });

  s.addText(slide.title, {
    x: 0.5,
    y: 0.15,
    w: 8.5,
    h: 0.55,
    fontSize: 22,
    bold: true,
    color: COLORS.white,
    fontFace: "Yu Gothic UI",
  });

  s.addText(`${index} / ${total}`, {
    x: 8.8,
    y: 5.2,
    w: 0.8,
    h: 0.3,
    fontSize: 10,
    color: closing ? COLORS.accent : COLORS.muted,
    align: "right",
    fontFace: "Yu Gothic UI",
  });

  const bullets = slide.bullets.filter(Boolean);
  if (bullets.length) {
    const rows = bullets.map((text) => ({
      text,
      options: {
        bullet: { code: "2022" },
        breakLine: true,
        fontSize: closing ? 17 : 16,
        color: closing ? COLORS.white : COLORS.text,
        fontFace: "Yu Gothic UI",
        paraSpaceBefore: 6,
      },
    }));

    s.addText(rows, {
      x: 0.6,
      y: 1.2,
      w: 8.6,
      h: 4.2,
      valign: "top",
    });
  }

  if (!closing) {
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 5.45,
      w: 2.5,
      h: 0.06,
      fill: { color: COLORS.blue },
    });
  }
}

export async function buildPptxFromOutline(outline: DocOutline): Promise<{
  base64: string;
  fileName: string;
}> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = outline.author ?? "AQUA Docs";
  pptx.title = outline.documentTitle;
  pptx.company = "Internal Proposal";

  const contentSlides = outline.slides.filter((s) => s.layout !== "title");
  const total = outline.slides.length;

  outline.slides.forEach((slide, idx) => {
    if (slide.layout === "title") {
      addTitleSlide(pptx, slide, outline);
      return;
    }
    const slideNum = idx + 1;
    addContentSlide(pptx, slide, slideNum, total, slide.layout === "closing");
  });

  const base64 = (await pptx.write({ outputType: "base64" })) as string;
  return {
    base64,
    fileName: sanitizeFileName(outline.documentTitle),
  };
}
