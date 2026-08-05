import pptxgen from "pptxgenjs";
import { sanitizeFileName } from "@/lib/docs-utils";
import type { DocOutline, DocSlideOutline, DocSlideVisual } from "@/lib/types/docs";

const COLORS = {
  navy: "1B2A4A",
  blue: "2563EB",
  sky: "3B82F6",
  light: "E0E7FF",
  white: "FFFFFF",
  text: "1E293B",
  muted: "64748B",
  accent: "60A5FA",
  green: "10B981",
  orange: "F59E0B",
  purple: "8B5CF6",
  pink: "EC4899",
} as const;

const ICON_FILLS = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.pink];

function addVisualDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  visual: DocSlideVisual,
  opts: { x: number; y: number; w: number; h: number; dark?: boolean },
) {
  const labels = visual.labels.slice(0, 5);
  const { x, y, w, h, dark = false } = opts;
  const textColor = dark ? COLORS.white : COLORS.text;
  const lineColor = dark ? COLORS.accent : COLORS.blue;

  switch (visual.type) {
    case "flow":
      addFlowDiagram(pptx, s, labels, { x, y, w, h, textColor, lineColor });
      break;
    case "comparison":
      addComparisonDiagram(pptx, s, labels, { x, y, w, h, textColor, lineColor });
      break;
    case "timeline":
      addTimelineDiagram(pptx, s, labels, { x, y, w, h, textColor, lineColor });
      break;
    case "pyramid":
      addPyramidDiagram(pptx, s, labels, { x, y, w, h, textColor });
      break;
    case "icons":
      addIconsDiagram(pptx, s, labels, { x, y, w, h, textColor });
      break;
  }
}

function addFlowDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number; textColor: string; lineColor: string },
) {
  const { x, y, w, h, textColor, lineColor } = opts;
  const n = labels.length;
  const gap = 0.15;
  const arrowW = 0.25;
  const boxW = (w - gap * (n - 1) - arrowW * (n - 1)) / n;
  const boxH = h * 0.55;
  const boxY = y + (h - boxH) / 2;

  labels.forEach((label, i) => {
    const bx = x + i * (boxW + gap + arrowW);
    s.addShape(pptx.ShapeType.roundRect, {
      x: bx,
      y: boxY,
      w: boxW,
      h: boxH,
      fill: { color: COLORS.light },
      line: { color: lineColor, width: 1 },
      rectRadius: 0.08,
    });
    s.addText(label, {
      x: bx,
      y: boxY,
      w: boxW,
      h: boxH,
      fontSize: 10,
      color: textColor,
      align: "center",
      valign: "middle",
      fontFace: "Yu Gothic UI",
    });
    if (i < n - 1) {
      const ax = bx + boxW + 0.02;
      s.addText("→", {
        x: ax,
        y: boxY,
        w: arrowW,
        h: boxH,
        fontSize: 14,
        color: lineColor,
        align: "center",
        valign: "middle",
      });
    }
  });
}

function addComparisonDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number; textColor: string; lineColor: string },
) {
  const { x, y, w, h, textColor, lineColor } = opts;
  const midGap = 0.2;
  const colW = (w - midGap) / 2;
  const boxH = h * 0.7;
  const boxY = y + (h - boxH) / 2;
  const fills = [COLORS.light, "FEF3C7"];

  [0, 1].forEach((col) => {
    const cx = x + col * (colW + midGap);
    s.addShape(pptx.ShapeType.roundRect, {
      x: cx,
      y: boxY,
      w: colW,
      h: boxH,
      fill: { color: fills[col] ?? COLORS.light },
      line: { color: col === 0 ? COLORS.blue : COLORS.orange, width: 1.5 },
      rectRadius: 0.1,
    });
    s.addText(labels[col] ?? "", {
      x: cx + 0.1,
      y: boxY + 0.15,
      w: colW - 0.2,
      h: boxH - 0.3,
      fontSize: 11,
      color: textColor,
      align: "center",
      valign: "middle",
      fontFace: "Yu Gothic UI",
    });
  });

  if (labels.length > 2) {
    s.addText(labels.slice(2).join("\n"), {
      x: x,
      y: boxY + boxH + 0.05,
      w: w,
      h: h * 0.25,
      fontSize: 9,
      color: COLORS.muted,
      align: "center",
      fontFace: "Yu Gothic UI",
    });
  }
}

function addTimelineDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number; textColor: string; lineColor: string },
) {
  const { x, y, w, h, textColor, lineColor } = opts;
  const n = labels.length;
  const lineY = y + h * 0.45;
  const nodeR = 0.12;

  s.addShape(pptx.ShapeType.line, {
    x: x + 0.1,
    y: lineY,
    w: w - 0.2,
    h: 0,
    line: { color: lineColor, width: 2 },
  });

  labels.forEach((label, i) => {
    const nx = x + 0.1 + (i / Math.max(n - 1, 1)) * (w - 0.2);
    s.addShape(pptx.ShapeType.ellipse, {
      x: nx - nodeR,
      y: lineY - nodeR,
      w: nodeR * 2,
      h: nodeR * 2,
      fill: { color: ICON_FILLS[i % ICON_FILLS.length] },
      line: { color: COLORS.white, width: 1 },
    });
    s.addText(label, {
      x: nx - 0.6,
      y: lineY + nodeR + 0.05,
      w: 1.2,
      h: h * 0.35,
      fontSize: 9,
      color: textColor,
      align: "center",
      fontFace: "Yu Gothic UI",
    });
  });
}

function addPyramidDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number; textColor: string },
) {
  const { x, y, w, h, textColor } = opts;
  const n = labels.length;
  const layerH = h / n;
  const maxW = w * 0.9;

  labels.forEach((label, i) => {
    const ratio = (n - i) / n;
    const lw = maxW * ratio;
    const lx = x + (w - lw) / 2;
    const ly = y + i * layerH + 0.05;
    s.addShape(pptx.ShapeType.roundRect, {
      x: lx,
      y: ly,
      w: lw,
      h: layerH - 0.1,
      fill: { color: ICON_FILLS[i % ICON_FILLS.length] },
      line: { color: COLORS.white, width: 0.5 },
      rectRadius: 0.05,
    });
    s.addText(label, {
      x: lx,
      y: ly,
      w: lw,
      h: layerH - 0.1,
      fontSize: 10,
      color: COLORS.white,
      align: "center",
      valign: "middle",
      fontFace: "Yu Gothic UI",
      bold: true,
    });
  });
}

function addIconsDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number; textColor: string },
) {
  const { x, y, w, h, textColor } = opts;
  const n = labels.length;
  const cols = n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const gapX = 0.15;
  const gapY = 0.12;
  const cellW = (w - gapX * (cols - 1)) / cols;
  const cellH = (h - gapY * (rows - 1)) / rows;

  labels.forEach((label, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cellW + gapX);
    const cy = y + row * (cellH + gapY);
    const fill = ICON_FILLS[i % ICON_FILLS.length];
    s.addShape(pptx.ShapeType.roundRect, {
      x: cx,
      y: cy,
      w: cellW,
      h: cellH * 0.65,
      fill: { color: fill },
      rectRadius: 0.1,
    });
    s.addText(label, {
      x: cx,
      y: cy + cellH * 0.65,
      w: cellW,
      h: cellH * 0.35,
      fontSize: 9,
      color: textColor,
      align: "center",
      valign: "top",
      fontFace: "Yu Gothic UI",
    });
  });
}

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
  const hasVisual = !!slide.visual;
  const bulletW = hasVisual ? 4.2 : 8.6;
  const bulletH = hasVisual ? 2.0 : 4.2;

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
      w: bulletW,
      h: bulletH,
      valign: "top",
    });
  }

  if (slide.visual) {
    addVisualDiagram(pptx, s, slide.visual, {
      x: hasVisual && bullets.length ? 5.0 : 0.6,
      y: hasVisual && bullets.length ? 1.2 : 2.8,
      w: hasVisual && bullets.length ? 4.5 : 8.6,
      h: hasVisual && bullets.length ? 3.5 : 2.4,
      dark: closing,
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
