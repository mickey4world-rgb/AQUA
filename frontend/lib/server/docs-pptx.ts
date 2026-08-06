import pptxgen from "pptxgenjs";
import { sanitizeFileName } from "@/lib/docs-utils";
import { DOCS_FONT, DOCS_THEME } from "@/lib/docs-theme";
import type { DocOutline, DocSlideOutline, DocSlideVisual } from "@/lib/types/docs";

const T = DOCS_THEME;
const BLUE_FILLS = [...T.blues];

function addSlideChrome(
  pptx: pptxgen,
  s: pptxgen.Slide,
  title: string,
  index: number,
  total: number,
  closing = false,
) {
  s.background = { color: closing ? T.navy : T.white };

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.9,
    fill: { color: T.navy },
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.06,
    h: 0.9,
    fill: { color: T.cyan },
  });

  s.addText(title, {
    x: 0.35,
    y: 0.18,
    w: 8.8,
    h: 0.55,
    fontSize: 22,
    bold: true,
    color: T.white,
    fontFace: DOCS_FONT,
  });

  s.addText(`${index} / ${total}`, {
    x: 8.85,
    y: 5.15,
    w: 0.75,
    h: 0.3,
    fontSize: 9,
    color: closing ? T.mint : T.slate,
    align: "right",
    fontFace: DOCS_FONT,
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.45,
    w: "100%",
    h: 0.04,
    fill: { color: T.teal },
  });
}

function addDiagramPanel(
  pptx: pptxgen,
  s: pptxgen.Slide,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  s.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: T.panel },
    line: { color: T.slate, width: 0.75 },
    rectRadius: 0.06,
  });
}

function addArchBox(
  pptx: pptxgen,
  s: pptxgen.Slide,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    headerColor?: string;
    bodyColor?: string;
    textColor?: string;
  },
) {
  const headerColor = opts.headerColor ?? T.teal;
  const bodyColor = opts.bodyColor ?? T.white;
  const textColor = opts.textColor ?? T.text;
  const headerH = Math.min(0.28, opts.h * 0.32);

  s.addShape(pptx.ShapeType.roundRect, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    fill: { color: bodyColor },
    line: { color: T.slate, width: 1 },
    rectRadius: 0.05,
  });

  s.addShape(pptx.ShapeType.rect, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: headerH,
    fill: { color: headerColor },
  });

  s.addText(opts.label, {
    x: opts.x + 0.05,
    y: opts.y + 0.02,
    w: opts.w - 0.1,
    h: headerH - 0.04,
    fontSize: 9,
    bold: true,
    color: T.white,
    align: "center",
    valign: "middle",
    fontFace: DOCS_FONT,
  });

  s.addShape(pptx.ShapeType.line, {
    x: opts.x + opts.w * 0.15,
    y: opts.y + headerH + 0.08,
    w: opts.w * 0.7,
    h: 0,
    line: { color: T.cyan, width: 0.75, dashType: "dash" },
  });
}

function addArrow(
  pptx: pptxgen,
  s: pptxgen.Slide,
  x: number,
  y: number,
  w: number,
  color = T.cyan,
) {
  s.addShape(pptx.ShapeType.line, {
    x,
    y,
    w,
    h: 0,
    line: { color, width: 1.5, endArrowType: "triangle" },
  });
}

function addVisualDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  visual: DocSlideVisual,
  opts: { x: number; y: number; w: number; h: number; dark?: boolean },
) {
  const labels = visual.labels.slice(0, 5);
  addDiagramPanel(pptx, s, opts.x, opts.y, opts.w, opts.h);

  const inner = {
    x: opts.x + 0.15,
    y: opts.y + 0.15,
    w: opts.w - 0.3,
    h: opts.h - 0.3,
  };

  switch (visual.type) {
    case "flow":
      addFlowDiagram(pptx, s, labels, inner);
      break;
    case "comparison":
      addComparisonDiagram(pptx, s, labels, inner);
      break;
    case "timeline":
      addTimelineDiagram(pptx, s, labels, inner);
      break;
    case "pyramid":
      addPyramidDiagram(pptx, s, labels, inner);
      break;
    case "icons":
      addIconsDiagram(pptx, s, labels, inner);
      break;
  }
}

function addFlowDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number },
) {
  const { x, y, w, h } = opts;
  const n = labels.length;
  const gap = 0.2;
  const arrowW = 0.35;
  const boxW = (w - gap * (n - 1) - arrowW * (n - 1)) / n;
  const boxH = h * 0.62;
  const boxY = y + (h - boxH) / 2;

  labels.forEach((label, i) => {
    const bx = x + i * (boxW + gap + arrowW);
    addArchBox(pptx, s, {
      x: bx,
      y: boxY,
      w: boxW,
      h: boxH,
      label,
      headerColor: BLUE_FILLS[i % BLUE_FILLS.length],
    });
    if (i < n - 1) {
      addArrow(pptx, s, bx + boxW + 0.04, boxY + boxH / 2, arrowW - 0.08, T.cyan);
    }
  });
}

function addComparisonDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number },
) {
  const { x, y, w, h } = opts;
  const midGap = 0.25;
  const colW = (w - midGap) / 2;
  const boxH = h * 0.75;
  const boxY = y + (h - boxH) / 2;

  [T.slate, T.teal].forEach((headerColor, col) => {
    const cx = x + col * (colW + midGap);
    addArchBox(pptx, s, {
      x: cx,
      y: boxY,
      w: colW,
      h: boxH,
      label: labels[col] ?? "",
      headerColor,
      bodyColor: col === 0 ? T.pale : T.white,
    });
  });

  s.addText("→", {
    x: x + colW + 0.02,
    y: boxY + boxH / 2 - 0.15,
    w: midGap,
    h: 0.3,
    fontSize: 18,
    color: T.cyan,
    align: "center",
    fontFace: DOCS_FONT,
  });

  if (labels.length > 2) {
    s.addText(labels.slice(2).join("  ·  "), {
      x,
      y: boxY + boxH + 0.08,
      w,
      h: h * 0.15,
      fontSize: 8,
      color: T.muted,
      align: "center",
      fontFace: DOCS_FONT,
    });
  }
}

function addTimelineDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number },
) {
  const { x, y, w, h } = opts;
  const n = labels.length;
  const lineY = y + h * 0.42;
  const nodeR = 0.14;

  s.addShape(pptx.ShapeType.line, {
    x: x + 0.05,
    y: lineY,
    w: w - 0.1,
    h: 0,
    line: { color: T.cyan, width: 2.5 },
  });

  labels.forEach((label, i) => {
    const nx = x + 0.05 + (i / Math.max(n - 1, 1)) * (w - 0.1);
    const fill = BLUE_FILLS[i % BLUE_FILLS.length];

    s.addShape(pptx.ShapeType.ellipse, {
      x: nx - nodeR,
      y: lineY - nodeR,
      w: nodeR * 2,
      h: nodeR * 2,
      fill: { color: fill },
      line: { color: T.white, width: 1.5 },
    });

    s.addText(String(i + 1), {
      x: nx - nodeR,
      y: lineY - nodeR,
      w: nodeR * 2,
      h: nodeR * 2,
      fontSize: 9,
      bold: true,
      color: T.white,
      align: "center",
      valign: "middle",
      fontFace: DOCS_FONT,
    });

    s.addShape(pptx.ShapeType.roundRect, {
      x: nx - 0.55,
      y: lineY + nodeR + 0.08,
      w: 1.1,
      h: h * 0.28,
      fill: { color: T.white },
      line: { color: T.slate, width: 0.75 },
      rectRadius: 0.04,
    });

    s.addText(label, {
      x: nx - 0.5,
      y: lineY + nodeR + 0.1,
      w: 1.0,
      h: h * 0.24,
      fontSize: 8,
      color: T.text,
      align: "center",
      valign: "middle",
      fontFace: DOCS_FONT,
    });
  });
}

function addPyramidDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number },
) {
  const { x, y, w, h } = opts;
  const n = labels.length;
  const layerH = h / n;
  const maxW = w * 0.92;

  labels.forEach((label, i) => {
    const ratio = (n - i) / n;
    const lw = maxW * ratio;
    const lx = x + (w - lw) / 2;
    const ly = y + i * layerH + 0.04;
    const fill = BLUE_FILLS[Math.min(i, BLUE_FILLS.length - 1)];

    s.addShape(pptx.ShapeType.roundRect, {
      x: lx,
      y: ly,
      w: lw,
      h: layerH - 0.08,
      fill: { color: fill },
      line: { color: T.white, width: 0.75 },
      rectRadius: 0.05,
    });

    s.addText(label, {
      x: lx,
      y: ly,
      w: lw,
      h: layerH - 0.08,
      fontSize: 10,
      bold: true,
      color: T.white,
      align: "center",
      valign: "middle",
      fontFace: DOCS_FONT,
    });
  });
}

function addIconsDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  labels: string[],
  opts: { x: number; y: number; w: number; h: number },
) {
  const { x, y, w, h } = opts;
  const n = labels.length;
  const cols = n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const gapX = 0.18;
  const gapY = 0.14;
  const cellW = (w - gapX * (cols - 1)) / cols;
  const cellH = (h - gapY * (rows - 1)) / rows;

  labels.forEach((label, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cellW + gapX);
    const cy = y + row * (cellH + gapY);
    const headerColor = BLUE_FILLS[i % BLUE_FILLS.length];

    addArchBox(pptx, s, {
      x: cx,
      y: cy,
      w: cellW,
      h: cellH,
      label,
      headerColor,
      bodyColor: T.white,
    });
  });
}

function addTitleSlide(pptx: pptxgen, slide: DocSlideOutline, outline: DocOutline) {
  const s = pptx.addSlide();
  s.background = { color: T.navy };

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.12,
    h: "100%",
    fill: { color: T.teal },
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0.12,
    y: 0,
    w: 0.04,
    h: "100%",
    fill: { color: T.cyan },
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.35,
    w: 3.5,
    h: 0.05,
    fill: { color: T.cyan },
  });

  s.addText(outline.documentTitle, {
    x: 0.55,
    y: 1.55,
    w: 8.8,
    h: 1.3,
    fontSize: 36,
    bold: true,
    color: T.white,
    fontFace: DOCS_FONT,
  });

  const sub = slide.subtitle ?? outline.subtitle ?? "";
  if (sub) {
    s.addText(sub, {
      x: 0.55,
      y: 2.95,
      w: 8.5,
      h: 0.7,
      fontSize: 18,
      color: T.mint,
      fontFace: DOCS_FONT,
    });
  }

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.35,
    w: "100%",
    h: 0.06,
    fill: { color: T.teal },
  });

  const meta = [outline.author, new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("  ·  ");
  if (meta) {
    s.addText(meta, {
      x: 0.55,
      y: 5.05,
      w: 8.5,
      h: 0.35,
      fontSize: 10,
      color: T.mint,
      fontFace: DOCS_FONT,
    });
  }

  s.addShape(pptx.ShapeType.roundRect, {
    x: 7.8,
    y: 4.2,
    w: 1.8,
    h: 0.9,
    fill: { color: T.teal, transparency: 30 },
    line: { color: T.cyan, width: 1 },
    rectRadius: 0.08,
  });
}

function addContentSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
  closing = false,
) {
  const s = pptx.addSlide();
  addSlideChrome(pptx, s, slide.title, index, total, closing);

  const bullets = slide.bullets.filter(Boolean);
  const hasVisual = !!slide.visual;
  const bulletW = hasVisual ? 4.0 : 8.8;
  const bulletH = hasVisual ? 2.2 : 4.0;
  const bulletY = closing ? 1.15 : 1.1;

  if (bullets.length) {
    const rows = bullets.map((text) => ({
      text,
      options: {
        bullet: { code: "2022" },
        breakLine: true,
        fontSize: closing ? 16 : 15,
        color: closing ? T.white : T.text,
        fontFace: DOCS_FONT,
        paraSpaceBefore: 8,
      },
    }));

    s.addText(rows, {
      x: 0.45,
      y: bulletY,
      w: bulletW,
      h: bulletH,
      valign: "top",
    });
  }

  if (slide.visual) {
    addVisualDiagram(pptx, s, slide.visual, {
      x: hasVisual && bullets.length ? 4.85 : 0.45,
      y: hasVisual && bullets.length ? 1.05 : 1.8,
      w: hasVisual && bullets.length ? 4.65 : 8.8,
      h: hasVisual && bullets.length ? 3.8 : 2.8,
      dark: closing,
    });
  }

  if (!closing && !hasVisual) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.45,
      y: 4.6,
      w: 2.0,
      h: 0.5,
      fill: { color: T.pale },
      line: { color: T.slate, width: 0.5 },
      rectRadius: 0.05,
    });
    s.addText("CONFIDENTIAL", {
      x: 0.45,
      y: 4.6,
      w: 2.0,
      h: 0.5,
      fontSize: 8,
      color: T.slate,
      align: "center",
      valign: "middle",
      fontFace: DOCS_FONT,
      bold: true,
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
  pptx.theme = { headFontFace: DOCS_FONT, bodyFontFace: DOCS_FONT };

  const total = outline.slides.length;

  outline.slides.forEach((slide, idx) => {
    if (slide.layout === "title") {
      addTitleSlide(pptx, slide, outline);
      return;
    }
    addContentSlide(pptx, slide, idx + 1, total, slide.layout === "closing");
  });

  const base64 = (await pptx.write({ outputType: "base64" })) as string;
  return {
    base64,
    fileName: sanitizeFileName(outline.documentTitle),
  };
}
