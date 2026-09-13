import pptxgen from "pptxgenjs";
import { sanitizeFileName } from "@/lib/docs-utils";
import { DOCS_FONT, DOCS_THEME } from "@/lib/docs-theme";
import type {
  DocCloudArchitecture,
  DocCloudArchNode,
  DocOutline,
  DocSlideOutline,
  DocSlideVisual,
} from "@/lib/types/docs";
import {
  resolveDocsStockImages,
  type DocsResolvedImage,
} from "@/lib/server/docs-stock-images";
import {
  cloudServiceDisplayName,
  costHintFor,
  formatYen,
  getCloudIconPngBase64,
  getSlideCloudArch,
} from "@/lib/server/docs-cloud-arch";
import {
  diagramNodesForZoneLayout,
  shouldUseZoneLayout,
} from "@/lib/server/docs-cloud-zones";
import type { DocCloudArchZone } from "@/lib/types/docs";

const T = DOCS_THEME;
const BLUE_FILLS = [...T.blues];

type ImageMap = Map<number, DocsResolvedImage>;

function pptxImageType(ext: DocsResolvedImage["ext"]): "jpg" | "png" {
  return ext === "png" ? "png" : "jpg";
}

function addResolvedImage(
  s: pptxgen.Slide,
  img: DocsResolvedImage,
  opts: { x: number; y: number; w: number; h: number; transparency?: number },
) {
  s.addImage({
    data: `data:image/${pptxImageType(img.ext)};base64,${img.data}`,
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    sizing: { type: "cover", w: opts.w, h: opts.h },
    transparency: opts.transparency,
  });
}

/** ノードをエッジからレイヤー列に配置（ゾーン無しの簡易図用） */
function layerCloudNodes(
  nodes: DocCloudArchNode[],
  edges: { from: string; to: string }[],
): DocCloudArchNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const outs = new Map<string, string[]>();
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    const list = outs.get(e.from) ?? [];
    list.push(e.to);
    outs.set(e.from, list);
  }
  let frontier = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (!frontier.length) frontier = [nodes[0].id];
  const layers: DocCloudArchNode[][] = [];
  const placed = new Set<string>();
  while (frontier.length && layers.length < 6) {
    const layerNodes = frontier
      .map((id) => byId.get(id))
      .filter((n): n is DocCloudArchNode => Boolean(n && !placed.has(n.id)));
    if (!layerNodes.length) break;
    layers.push(layerNodes.slice(0, 5));
    layerNodes.forEach((n) => placed.add(n.id));
    const next: string[] = [];
    for (const n of layerNodes) {
      for (const t of outs.get(n.id) ?? []) {
        if (!placed.has(t) && !next.includes(t)) next.push(t);
      }
    }
    frontier = next;
  }
  const rest = nodes.filter((n) => !placed.has(n.id));
  if (rest.length) {
    for (let i = 0; i < rest.length; i += 5) {
      layers.push(rest.slice(i, i + 5));
    }
  }
  return layers.length ? layers : [nodes.slice(0, 5)];
}

type NodePos = { cx: number; cy: number; w: number; h: number };

function drawCloudNodeCard(
  pptx: pptxgen,
  s: pptxgen.Slide,
  provider: DocCloudArchitecture["provider"],
  node: DocCloudArchNode,
  box: { x: number; y: number; w: number; h: number },
  positions: Map<string, NodePos>,
) {
  const png = getCloudIconPngBase64(provider, node.service);
  const icon = Math.min(0.34, box.h * 0.38);
  s.addShape(pptx.ShapeType.roundRect, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: T.white },
    line: { color: T.slate, width: 0.85 },
    rectRadius: 0.06,
  });
  if (png) {
    s.addImage({
      data: `data:image/png;base64,${png}`,
      x: box.x + (box.w - icon) / 2,
      y: box.y + 0.05,
      w: icon,
      h: icon,
    });
  } else {
    s.addShape(pptx.ShapeType.roundRect, {
      x: box.x + (box.w - icon) / 2,
      y: box.y + 0.05,
      w: icon,
      h: icon,
      fill: { color: T.teal },
      rectRadius: 0.05,
    });
  }
  s.addText(node.label, {
    x: box.x + 0.03,
    y: box.y + icon + 0.08,
    w: box.w - 0.06,
    h: 0.2,
    fontSize: 8,
    bold: true,
    color: T.navy,
    align: "center",
    fontFace: DOCS_FONT,
  });
  if (box.h > 0.72) {
    s.addText(cloudServiceDisplayName(provider, node.service), {
      x: box.x + 0.03,
      y: box.y + box.h - 0.2,
      w: box.w - 0.06,
      h: 0.16,
      fontSize: 6,
      color: T.muted,
      align: "center",
      fontFace: DOCS_FONT,
    });
  }
  positions.set(node.id, {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    w: box.w,
    h: box.h,
  });
}

function layoutNodesInRect(
  pptx: pptxgen,
  s: pptxgen.Slide,
  provider: DocCloudArchitecture["provider"],
  nodes: DocCloudArchNode[],
  rect: { x: number; y: number; w: number; h: number },
  positions: Map<string, NodePos>,
) {
  if (!nodes.length) return;
  const cols = Math.min(4, Math.max(1, nodes.length <= 3 ? nodes.length : 3));
  const rows = Math.ceil(nodes.length / cols);
  const gapX = 0.08;
  const gapY = 0.08;
  const cellW = (rect.w - gapX * (cols - 1)) / cols;
  const cellH = Math.min(0.92, (rect.h - gapY * (rows - 1)) / rows);
  nodes.forEach((node, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    drawCloudNodeCard(pptx, s, provider, node, {
      x: rect.x + c * (cellW + gapX),
      y: rect.y + r * (cellH + gapY),
      w: cellW,
      h: cellH,
    }, positions);
  });
}

function drawZoneFrame(
  pptx: pptxgen,
  s: pptxgen.Slide,
  zone: DocCloudArchZone,
  box: { x: number; y: number; w: number; h: number },
  provider: DocCloudArchitecture["provider"],
) {
  const kind = zone.kind ?? "group";
  const isNet = kind === "vnet" || kind === "vpc";
  const isPrivate = kind === "private";
  const isMgmt = kind === "mgmt";
  const fill = isNet ? T.pale : isPrivate ? "EEF2F5" : isMgmt ? T.white : T.panel;
  const line = isPrivate || isMgmt ? T.cyan : T.teal;
  const dash = isPrivate || isMgmt;
  s.addShape(pptx.ShapeType.roundRect, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: fill },
    line: {
      color: line,
      width: isNet ? 1.6 : 1.15,
      dashType: dash ? "dash" : "solid",
    },
    rectRadius: 0.08,
  });
  const badgeService =
    kind === "vpc" ? "vpc" : kind === "vnet" ? "vnet" : kind === "private"
      ? provider === "aws"
        ? "vpc-endpoint"
        : "private-endpoint"
      : null;
  if (badgeService) {
    const png = getCloudIconPngBase64(provider, badgeService);
    if (png) {
      s.addImage({
        data: `data:image/png;base64,${png}`,
        x: box.x + box.w - 0.32,
        y: box.y + 0.06,
        w: 0.24,
        h: 0.24,
      });
    }
  }
  s.addText(zone.label, {
    x: box.x + 0.1,
    y: box.y + 0.06,
    w: box.w - 0.45,
    h: 0.24,
    fontSize: 10,
    bold: true,
    color: T.navy,
    fontFace: DOCS_FONT,
  });
}

function addCloudArchZonedDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  arch: DocCloudArchitecture,
  opts: { x: number; y: number; w: number; h: number },
) {
  const drawable = new Map(
    diagramNodesForZoneLayout(arch).map((n) => [n.id, n]),
  );
  const zones = arch.zones ?? [];
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const childIds = new Set(zones.flatMap((z) => z.childZoneIds ?? []));
  const topZones = zones.filter((z) => !childIds.has(z.id));

  const edge = topZones.find((z) => z.kind === "edge");
  const net = topZones.find((z) => z.kind === "vnet" || z.kind === "vpc");
  const mgmt = topZones.find((z) => z.kind === "mgmt");
  const otherTop = topZones.filter(
    (z) => z !== edge && z !== net && z !== mgmt,
  );

  const positions = new Map<string, NodePos>();
  const pad = 0.08;
  let yCursor = opts.y;
  const bodyH = opts.h - (mgmt ? 0.95 : 0);

  // Left edge strip + right main
  const edgeW = edge ? Math.min(1.55, opts.w * 0.28) : 0;
  const mainX = opts.x + (edgeW ? edgeW + 0.12 : 0);
  const mainW = opts.w - (edgeW ? edgeW + 0.12 : 0);

  if (edge) {
    const box = { x: opts.x, y: yCursor, w: edgeW, h: bodyH };
    drawZoneFrame(pptx, s, edge, box, arch.provider);
    const nodes = edge.nodeIds
      .map((id) => drawable.get(id))
      .filter((n): n is DocCloudArchNode => Boolean(n));
    layoutNodesInRect(
      pptx,
      s,
      arch.provider,
      nodes,
      {
        x: box.x + pad,
        y: box.y + 0.34,
        w: box.w - pad * 2,
        h: box.h - 0.42,
      },
      positions,
    );
  }

  const stack: DocCloudArchZone[] = [];
  if (net) stack.push(net);
  stack.push(...otherTop);
  const stackGap = 0.1;
  const stackH =
    (bodyH - stackGap * Math.max(0, stack.length - 1)) /
    Math.max(1, stack.length);

  stack.forEach((zone, zi) => {
    const box = {
      x: mainX,
      y: yCursor + zi * (stackH + stackGap),
      w: mainW,
      h: stackH,
    };
    drawZoneFrame(pptx, s, zone, box, arch.provider);
    const childZones = (zone.childZoneIds ?? [])
      .map((id) => zoneById.get(id))
      .filter((z): z is DocCloudArchZone => Boolean(z));
    const directNodes = zone.nodeIds
      .map((id) => drawable.get(id))
      .filter((n): n is DocCloudArchNode => Boolean(n));

    const contentY = box.y + 0.34;
    const contentH = box.h - 0.42;
    if (childZones.length) {
      const leftW = directNodes.length
        ? Math.min(mainW * 0.42, 2.2)
        : 0;
      if (directNodes.length) {
        layoutNodesInRect(
          pptx,
          s,
          arch.provider,
          directNodes,
          {
            x: box.x + pad,
            y: contentY,
            w: leftW - pad,
            h: contentH,
          },
          positions,
        );
      }
      const child = childZones[0];
      const cBox = {
        x: box.x + leftW + (leftW ? 0.08 : pad),
        y: contentY,
        w: box.w - leftW - (leftW ? 0.16 : pad * 2),
        h: contentH,
      };
      drawZoneFrame(pptx, s, child, cBox, arch.provider);
      const childNodes = child.nodeIds
        .map((id) => drawable.get(id))
        .filter((n): n is DocCloudArchNode => Boolean(n));
      layoutNodesInRect(
        pptx,
        s,
        arch.provider,
        childNodes,
        {
          x: cBox.x + pad,
          y: cBox.y + 0.3,
          w: cBox.w - pad * 2,
          h: cBox.h - 0.38,
        },
        positions,
      );
    } else {
      layoutNodesInRect(
        pptx,
        s,
        arch.provider,
        directNodes,
        {
          x: box.x + pad,
          y: contentY,
          w: box.w - pad * 2,
          h: contentH,
        },
        positions,
      );
    }
  });

  if (mgmt) {
    const box = {
      x: opts.x,
      y: opts.y + opts.h - 0.88,
      w: opts.w,
      h: 0.84,
    };
    drawZoneFrame(pptx, s, mgmt, box, arch.provider);
    const nodes = mgmt.nodeIds
      .map((id) => drawable.get(id))
      .filter((n): n is DocCloudArchNode => Boolean(n));
    layoutNodesInRect(
      pptx,
      s,
      arch.provider,
      nodes,
      {
        x: box.x + pad,
        y: box.y + 0.3,
        w: box.w - pad * 2,
        h: box.h - 0.38,
      },
      positions,
    );
  }

  // ゾーン間の主要エッジのみ（重なり防止）
  const edges = (arch.edges ?? []).slice(0, 8);
  for (const e of edges) {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) continue;
    const x1 = a.cx;
    const y1 = a.cy;
    const x2 = b.cx;
    const y2 = b.cy;
    s.addShape(pptx.ShapeType.line, {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(0.05, Math.abs(x2 - x1)),
      h: Math.max(0.02, Math.abs(y2 - y1)),
      line: { color: T.cyan, width: 1.1, endArrowType: "triangle" },
    });
  }
}

function addCloudArchFlatDiagram(
  pptx: pptxgen,
  s: pptxgen.Slide,
  arch: DocCloudArchitecture,
  opts: { x: number; y: number; w: number; h: number },
) {
  const edges = arch.edges ?? [];
  const layers = layerCloudNodes(arch.nodes, edges);
  const colN = layers.length;
  const gapX = 0.18;
  const colW = (innerW(opts) - gapX * Math.max(0, colN - 1)) / Math.max(1, colN);
  const positions = new Map<string, NodePos>();
  const inner = {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
  };

  layers.forEach((layer, li) => {
    const rowN = layer.length;
    const gapY = 0.1;
    const nodeH = Math.min(
      arch.nodes.length >= 9 ? 0.88 : 1.05,
      (inner.h - gapY * Math.max(0, rowN - 1)) / Math.max(1, rowN),
    );
    const nodeW = Math.min(colW, arch.nodes.length >= 9 ? 1.45 : 1.7);
    const colX = inner.x + li * (colW + gapX) + (colW - nodeW) / 2;
    layer.forEach((node, ri) => {
      drawCloudNodeCard(
        pptx,
        s,
        arch.provider,
        node,
        {
          x: colX,
          y: inner.y + ri * (nodeH + gapY),
          w: nodeW,
          h: nodeH,
        },
        positions,
      );
    });
  });

  for (const e of edges.slice(0, 10)) {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) continue;
    const x1 = a.cx + a.w * 0.4;
    const y1 = a.cy;
    const x2 = b.cx - b.w * 0.4;
    const y2 = b.cy;
    const w = Math.max(0.05, x2 - x1);
    s.addShape(pptx.ShapeType.line, {
      x: x1,
      y: y1,
      w,
      h: y2 - y1,
      line: { color: T.cyan, width: 1.25, endArrowType: "triangle" },
    });
  }
}

function innerW(opts: { w: number }) {
  return opts.w;
}

function addCloudArchDiagramOnly(
  pptx: pptxgen,
  s: pptxgen.Slide,
  arch: DocCloudArchitecture,
  opts: { x: number; y: number; w: number; h: number },
) {
  addDiagramPanel(pptx, s, opts.x, opts.y, opts.w, opts.h);
  const providerLabel = arch.provider === "aws" ? "AWS" : "Azure";
  const caption = arch.caption
    ? `${arch.caption} · ${providerLabel}`
    : `想定 ${providerLabel} 構成`;
  s.addText(caption, {
    x: opts.x + 0.12,
    y: opts.y + 0.06,
    w: opts.w - 0.24,
    h: 0.26,
    fontSize: 10,
    color: T.muted,
    fontFace: DOCS_FONT,
  });

  const inner = {
    x: opts.x + 0.12,
    y: opts.y + 0.34,
    w: opts.w - 0.24,
    h: opts.h - 0.44,
  };

  if (shouldUseZoneLayout(arch) && (arch.zones?.length ?? 0) > 0) {
    addCloudArchZonedDiagram(pptx, s, arch, inner);
  } else {
    addCloudArchFlatDiagram(pptx, s, arch, inner);
  }
}

function addCloudCostTable(
  pptx: pptxgen,
  s: pptxgen.Slide,
  arch: DocCloudArchitecture,
  opts: { x: number; y: number; w: number; h: number },
) {
  const rows = arch.nodes.slice(0, 12);
  const headerH = 0.28;
  const rowH = Math.min(
    rows.length >= 9 ? 0.26 : 0.34,
    (opts.h - headerH - 0.45) / Math.max(1, rows.length),
  );
  s.addText("サービス一覧と月額想定", {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: 0.28,
    fontSize: 12,
    bold: true,
    color: T.navy,
    fontFace: DOCS_FONT,
  });
  const tableY = opts.y + 0.3;
  s.addShape(pptx.ShapeType.rect, {
    x: opts.x,
    y: tableY,
    w: opts.w,
    h: headerH,
    fill: { color: T.navy },
  });
  const cols = [
    { label: "役割", x: 0, w: 0.18 },
    { label: "サービス", x: 0.18, w: 0.28 },
    { label: "前提（概算）", x: 0.46, w: 0.36 },
    { label: "月額", x: 0.82, w: 0.18 },
  ];
  cols.forEach((c) => {
    s.addText(c.label, {
      x: opts.x + opts.w * c.x + 0.06,
      y: tableY + 0.04,
      w: opts.w * c.w - 0.08,
      h: 0.24,
      fontSize: 9,
      bold: true,
      color: T.white,
      fontFace: DOCS_FONT,
    });
  });

  rows.forEach((node, i) => {
    const y = tableY + headerH + i * rowH;
    if (i % 2 === 0) {
      s.addShape(pptx.ShapeType.rect, {
        x: opts.x,
        y,
        w: opts.w,
        h: rowH,
        fill: { color: T.panel },
      });
    }
    const hint = costHintFor(arch.provider, node.service);
    const cells = [
      node.label,
      cloudServiceDisplayName(arch.provider, node.service),
      hint?.skuNote ?? "—",
      formatYen(node.monthlyCostJpy ?? 0),
    ];
    cols.forEach((c, ci) => {
      s.addText(cells[ci], {
        x: opts.x + opts.w * c.x + 0.06,
        y: y + 0.04,
        w: opts.w * c.w - 0.08,
        h: rowH - 0.06,
        fontSize: 9,
        color: T.text,
        fontFace: DOCS_FONT,
        valign: "middle",
        bold: ci === 3,
      });
    });
  });

  const totalY = tableY + headerH + rows.length * rowH + 0.08;
  s.addShape(pptx.ShapeType.roundRect, {
    x: opts.x,
    y: totalY,
    w: opts.w,
    h: 0.42,
    fill: { color: T.pale },
    line: { color: T.teal, width: 0.8 },
    rectRadius: 0.06,
  });
  s.addText("想定月額合計（概算）", {
    x: opts.x + 0.15,
    y: totalY + 0.06,
    w: opts.w * 0.55,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: T.navy,
    fontFace: DOCS_FONT,
    valign: "middle",
  });
  s.addText(formatYen(arch.totalMonthlyJpy ?? 0), {
    x: opts.x + opts.w * 0.55,
    y: totalY + 0.06,
    w: opts.w * 0.42,
    h: 0.3,
    fontSize: 14,
    bold: true,
    color: T.teal,
    align: "right",
    fontFace: DOCS_FONT,
    valign: "middle",
  });
  if (arch.costNote) {
    s.addText(arch.costNote, {
      x: opts.x,
      y: totalY + 0.46,
      w: opts.w,
      h: 0.28,
      fontSize: 8,
      color: T.muted,
      fontFace: DOCS_FONT,
    });
  }
}

function addCloudArchSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
) {
  const arch = getSlideCloudArch(slide);
  if (!arch) {
    addContentSlide(pptx, { ...slide, layout: "content" }, index, total, false);
    return;
  }
  const s = pptx.addSlide();
  addSlideChrome(pptx, s, slide.title, index, total, false);
  let y = 0.92;
  if (slide.keyMessage) {
    addKeyMessage(pptx, s, slide.keyMessage, { x: 0.35, y, w: 9.2 });
    y += 0.5;
  }

  // 左: 構成図 / 右: 費用表
  const diagramH = Math.min(3.55, 5.15 - y);
  addCloudArchDiagramOnly(pptx, s, arch, {
    x: 0.3,
    y,
    w: 5.35,
    h: diagramH,
  });
  addCloudCostTable(pptx, s, arch, {
    x: 5.8,
    y,
    w: 3.75,
    h: diagramH,
  });
}

function addSlideChrome(
  pptx: pptxgen,
  s: pptxgen.Slide,
  title: string,
  index: number,
  total: number,
  closing = false,
) {
  s.background = { color: closing ? T.navy : T.white };

  // ヘッダー帯（やや低め＝本文の余白を確保）
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.78,
    fill: { color: T.navy },
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.08,
    h: 0.78,
    fill: { color: T.cyan },
  });

  s.addText(title, {
    x: 0.32,
    y: 0.16,
    w: 8.6,
    h: 0.48,
    fontSize: title.length > 28 ? 18 : 20,
    bold: true,
    color: T.white,
    fontFace: DOCS_FONT,
    valign: "middle",
  });

  s.addText(`${index} / ${total}`, {
    x: 8.7,
    y: 5.12,
    w: 0.9,
    h: 0.28,
    fontSize: 9,
    color: closing ? T.mint : T.slate,
    align: "right",
    fontFace: DOCS_FONT,
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.42,
    w: "100%",
    h: 0.06,
    fill: { color: closing ? T.cyan : T.teal },
  });
}

function bulletFontSize(count: number, base = 14): number {
  if (count >= 4) return base - 1;
  return base;
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

function addTitleSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  outline: DocOutline,
  resolved?: DocsResolvedImage,
) {
  const s = pptx.addSlide();
  s.background = { color: T.navy };

  if (resolved) {
    // 右半分ヒーロー写真（Gamma風）
    addResolvedImage(s, resolved, { x: 5.2, y: 0, w: 4.8, h: 5.48 });
    s.addShape(pptx.ShapeType.rect, {
      x: 4.6,
      y: 0,
      w: 1.2,
      h: "100%",
      fill: { color: T.navy, transparency: 15 },
    });
    // 左テキスト領域の暗幕
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 5.5,
      h: "100%",
      fill: { color: T.navy },
    });
  }

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.14,
    h: "100%",
    fill: { color: T.teal },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0.14,
    y: 0,
    w: 0.05,
    h: "100%",
    fill: { color: T.cyan },
  });

  if (!resolved) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: 6.6,
      y: 3.35,
      w: 3.1,
      h: 1.55,
      fill: { color: T.teal, transparency: 55 },
      line: { color: T.cyan, width: 1 },
      rectRadius: 0.1,
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: 7.05,
      y: 2.85,
      w: 2.4,
      h: 1.15,
      fill: { color: T.cyan, transparency: 72 },
      line: { color: T.mint, width: 0.75 },
      rectRadius: 0.08,
    });
  }

  s.addShape(pptx.ShapeType.rect, {
    x: 0.55,
    y: 1.45,
    w: 2.4,
    h: 0.06,
    fill: { color: T.cyan },
  });

  const title = outline.documentTitle || slide.title;
  s.addText(title, {
    x: 0.55,
    y: 1.7,
    w: resolved ? 4.6 : 8.6,
    h: 1.35,
    fontSize: title.length > 24 ? 28 : 34,
    bold: true,
    color: T.white,
    fontFace: DOCS_FONT,
    valign: "top",
  });

  const sub = slide.subtitle ?? outline.subtitle ?? "";
  if (sub) {
    s.addText(sub, {
      x: 0.55,
      y: 3.15,
      w: resolved ? 4.4 : 5.8,
      h: 0.65,
      fontSize: 15,
      color: T.mint,
      fontFace: DOCS_FONT,
    });
  }

  const meta = [outline.author, new Date().toLocaleDateString("ja-JP")]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) {
    s.addText(meta, {
      x: 0.55,
      y: 4.95,
      w: 4.5,
      h: 0.3,
      fontSize: 11,
      color: T.mint,
      fontFace: DOCS_FONT,
    });
  }

  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.38,
    w: "100%",
    h: 0.1,
    fill: { color: T.teal },
  });
}

function addSectionSlide(pptx: pptxgen, slide: DocSlideOutline, index: number, total: number) {
  const s = pptx.addSlide();
  s.background = { color: T.navy };
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.12,
    h: "100%",
    fill: { color: T.cyan },
  });
  s.addText(`SECTION  ${String(index).padStart(2, "0")}`, {
    x: 0.7,
    y: 1.9,
    w: 8,
    h: 0.35,
    fontSize: 12,
    color: T.cyan,
    fontFace: DOCS_FONT,
    bold: true,
  });
  s.addText(slide.title, {
    x: 0.7,
    y: 2.35,
    w: 8.2,
    h: 1.0,
    fontSize: 30,
    bold: true,
    color: T.white,
    fontFace: DOCS_FONT,
  });
  if (slide.keyMessage || slide.subtitle) {
    s.addText(slide.keyMessage || slide.subtitle || "", {
      x: 0.7,
      y: 3.5,
      w: 8,
      h: 0.5,
      fontSize: 14,
      color: T.mint,
      fontFace: DOCS_FONT,
    });
  }
  s.addText(`${index} / ${total}`, {
    x: 8.7,
    y: 5.1,
    w: 0.9,
    h: 0.28,
    fontSize: 9,
    color: T.mint,
    align: "right",
    fontFace: DOCS_FONT,
  });
}

function addKeyMessage(
  pptx: pptxgen,
  s: pptxgen.Slide,
  message: string,
  opts: { x: number; y: number; w: number; dark?: boolean },
) {
  s.addShape(pptx.ShapeType.roundRect, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: 0.48,
    fill: { color: opts.dark ? T.teal : T.pale },
    line: { color: opts.dark ? T.cyan : T.slate, width: 0.75 },
    rectRadius: 0.06,
  });
  s.addText(message, {
    x: opts.x + 0.15,
    y: opts.y + 0.05,
    w: opts.w - 0.3,
    h: 0.38,
    fontSize: 12,
    bold: true,
    color: opts.dark ? T.white : T.navy,
    fontFace: DOCS_FONT,
    valign: "middle",
  });
}

function addContentSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
  closing = false,
  resolved?: DocsResolvedImage,
) {
  const s = pptx.addSlide();
  addSlideChrome(pptx, s, slide.title, index, total, closing);

  const bullets = slide.bullets.filter(Boolean);
  const cloudArch = getSlideCloudArch(slide);
  const useCloud = Boolean(cloudArch) && !closing;
  const usePhoto = Boolean(resolved) && !closing && !useCloud;
  const hasVisual = !!slide.visual && !usePhoto && !useCloud;
  const hasSide = useCloud || usePhoto || hasVisual;
  const hasKey = Boolean(slide.keyMessage);
  let y = 0.98;
  if (hasKey && slide.keyMessage) {
    addKeyMessage(pptx, s, slide.keyMessage, {
      x: 0.4,
      y,
      w: 9.1,
      dark: closing,
    });
    y += 0.58;
  }

  const bulletW = hasSide ? 4.05 : 9.0;
  const bulletH = hasSide ? 3.5 : closing ? 3.2 : 3.6;
  const fontSize = bulletFontSize(bullets.length, closing ? 15 : 14);

  if (bullets.length) {
    if (!hasSide && bullets.length <= 4) {
      const gap = 0.14;
      const cardH = Math.min(0.78, (bulletH - gap * (bullets.length - 1)) / bullets.length);
      bullets.forEach((text, i) => {
        const cy = y + i * (cardH + gap);
        s.addShape(pptx.ShapeType.roundRect, {
          x: 0.4,
          y: cy,
          w: 9.1,
          h: cardH,
          fill: { color: closing ? T.teal : T.panel },
          line: { color: closing ? T.cyan : T.slate, width: 0.6 },
          rectRadius: 0.06,
        });
        s.addShape(pptx.ShapeType.roundRect, {
          x: 0.55,
          y: cy + cardH * 0.22,
          w: 0.34,
          h: 0.34,
          fill: { color: BLUE_FILLS[i % BLUE_FILLS.length] },
          rectRadius: 0.04,
        });
        s.addText(String(i + 1), {
          x: 0.55,
          y: cy + cardH * 0.22,
          w: 0.34,
          h: 0.34,
          fontSize: 10,
          bold: true,
          color: T.white,
          align: "center",
          valign: "middle",
          fontFace: DOCS_FONT,
        });
        s.addText(text, {
          x: 1.05,
          y: cy + 0.08,
          w: 8.2,
          h: cardH - 0.16,
          fontSize,
          color: closing ? T.white : T.text,
          fontFace: DOCS_FONT,
          valign: "middle",
        });
      });
    } else {
      const rows = bullets.map((text) => ({
        text,
        options: {
          bullet: { code: "2022" },
          breakLine: true,
          fontSize,
          color: closing ? T.white : T.text,
          fontFace: DOCS_FONT,
          paraSpaceBefore: 10,
          paraSpaceAfter: 4,
        },
      }));
      s.addText(rows, {
        x: 0.45,
        y,
        w: bulletW,
        h: bulletH,
        valign: "top",
      });
    }
  }

  const sideX = bullets.length ? 4.75 : 0.45;
  const sideY = hasKey ? 1.55 : 1.05;
  const sideW = bullets.length ? 4.75 : 9.0;
  const sideH = bullets.length ? 3.55 : 3.7;

  if (useCloud && cloudArch) {
    addCloudArchDiagramOnly(pptx, s, cloudArch, {
      x: sideX,
      y: sideY,
      w: sideW,
      h: sideH,
    });
  } else if (usePhoto && resolved) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: sideX,
      y: sideY,
      w: sideW,
      h: sideH,
      fill: { color: T.panel },
      line: { color: T.slate, width: 0.75 },
      rectRadius: 0.08,
    });
    addResolvedImage(s, resolved, {
      x: sideX + 0.08,
      y: sideY + 0.08,
      w: sideW - 0.16,
      h: sideH - 0.16,
    });
  } else if (slide.visual) {
    addVisualDiagram(pptx, s, slide.visual, {
      x: sideX,
      y: sideY,
      w: sideW,
      h: sideH,
      dark: closing,
    });
  }
}

function addTwoColumnSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
) {
  const cols = slide.columns;
  if (!cols || cols.length < 2) {
    addContentSlide(pptx, { ...slide, layout: "content" }, index, total, false);
    return;
  }

  const s = pptx.addSlide();
  addSlideChrome(pptx, s, slide.title, index, total, false);

  const gap = 0.28;
  const colW = (9.1 - gap) / 2;
  cols.forEach((col, i) => {
    const x = 0.4 + i * (colW + gap);
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.05,
      w: colW,
      h: 3.95,
      fill: { color: i === 0 ? T.pale : T.white },
      line: { color: T.slate, width: 0.9 },
      rectRadius: 0.08,
    });
    s.addShape(pptx.ShapeType.rect, {
      x,
      y: 1.05,
      w: colW,
      h: 0.55,
      fill: { color: i === 0 ? T.slate : T.teal },
    });
    s.addText(col.title, {
      x: x + 0.15,
      y: 1.12,
      w: colW - 0.3,
      h: 0.42,
      fontSize: 14,
      bold: true,
      color: T.white,
      fontFace: DOCS_FONT,
      valign: "middle",
    });
    const rows = col.bullets.map((text) => ({
      text,
      options: {
        bullet: { code: "2022" },
        breakLine: true,
        fontSize: 13,
        color: T.text,
        fontFace: DOCS_FONT,
        paraSpaceBefore: 10,
      },
    }));
    s.addText(rows, {
      x: x + 0.2,
      y: 1.8,
      w: colW - 0.4,
      h: 3.0,
      valign: "top",
    });
  });
}

function addCardsSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
) {
  const s = pptx.addSlide();
  addSlideChrome(pptx, s, slide.title, index, total, false);
  const titles = slide.bullets.filter(Boolean).slice(0, 4);
  const details = (slide.cardDetails ?? []).slice(0, titles.length);
  const n = Math.max(titles.length, 1);
  const cols = n === 4 ? 2 : n;
  const rows = Math.ceil(n / cols);
  const gapX = 0.22;
  const gapY = 0.2;
  const areaX = 0.4;
  const areaY = 1.05;
  const areaW = 9.1;
  const areaH = 3.95;
  const cellW = (areaW - gapX * (cols - 1)) / cols;
  const cellH = (areaH - gapY * (rows - 1)) / rows;

  titles.forEach((title, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = areaX + col * (cellW + gapX);
    const y = areaY + row * (cellH + gapY);
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: cellW,
      h: cellH,
      fill: { color: T.white },
      line: { color: T.slate, width: 0.9 },
      rectRadius: 0.08,
    });
    s.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 0.1,
      h: cellH,
      fill: { color: BLUE_FILLS[i % BLUE_FILLS.length] },
    });
    s.addText(title, {
      x: x + 0.25,
      y: y + 0.25,
      w: cellW - 0.4,
      h: 0.45,
      fontSize: 15,
      bold: true,
      color: T.navy,
      fontFace: DOCS_FONT,
    });
    if (details[i]) {
      s.addText(details[i], {
        x: x + 0.25,
        y: y + 0.85,
        w: cellW - 0.4,
        h: cellH - 1.15,
        fontSize: 12,
        color: T.muted,
        fontFace: DOCS_FONT,
        valign: "top",
      });
    }
  });
}

function addStatSlide(
  pptx: pptxgen,
  slide: DocSlideOutline,
  index: number,
  total: number,
) {
  const stats = (slide.stats ?? []).slice(0, 4);
  if (!stats.length) {
    addContentSlide(pptx, { ...slide, layout: "content" }, index, total, false);
    return;
  }

  const s = pptx.addSlide();
  addSlideChrome(pptx, s, slide.title, index, total, false);
  const n = stats.length;
  const gap = 0.22;
  const cardW = (9.1 - gap * (n - 1)) / n;
  stats.forEach((stat, i) => {
    const x = 0.4 + i * (cardW + gap);
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.35,
      w: cardW,
      h: 3.2,
      fill: { color: T.white },
      line: { color: T.slate, width: 0.9 },
      rectRadius: 0.1,
    });
    s.addShape(pptx.ShapeType.rect, {
      x,
      y: 1.35,
      w: cardW,
      h: 0.12,
      fill: { color: BLUE_FILLS[i % BLUE_FILLS.length] },
    });
    s.addText(stat.value, {
      x: x + 0.1,
      y: 2.05,
      w: cardW - 0.2,
      h: 1.0,
      fontSize: stat.value.length > 5 ? 26 : 34,
      bold: true,
      color: T.navy,
      align: "center",
      fontFace: DOCS_FONT,
    });
    s.addText(stat.label, {
      x: x + 0.15,
      y: 3.3,
      w: cardW - 0.3,
      h: 0.7,
      fontSize: 13,
      color: T.muted,
      align: "center",
      fontFace: DOCS_FONT,
    });
  });
}

export async function buildPptxFromOutline(outline: DocOutline): Promise<{
  base64: string;
  fileName: string;
  imageCount: number;
  cloudArchCount: number;
}> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = outline.author ?? "AQUA Docs";
  pptx.title = outline.documentTitle;
  pptx.company = "Internal Proposal";
  pptx.theme = { headFontFace: DOCS_FONT, bodyFontFace: DOCS_FONT };

  const total = outline.slides.length;

  const imageRequests = outline.slides
    .map((slide, slideIndex) =>
      slide.image?.query
        ? { slideIndex, query: slide.image.query }
        : null,
    )
    .filter((r): r is { slideIndex: number; query: string } => Boolean(r));

  const images: ImageMap = await resolveDocsStockImages(imageRequests, 4);

  outline.slides.forEach((slide, idx) => {
    const n = idx + 1;
    const resolved = images.get(idx);
    switch (slide.layout) {
      case "title":
        addTitleSlide(pptx, slide, outline, resolved);
        break;
      case "section":
        addSectionSlide(pptx, slide, n, total);
        break;
      case "twoColumn":
        addTwoColumnSlide(pptx, slide, n, total);
        break;
      case "cards":
        addCardsSlide(pptx, slide, n, total);
        break;
      case "stat":
        addStatSlide(pptx, slide, n, total);
        break;
      case "cloudArch":
      case "azureArch":
        addCloudArchSlide(pptx, slide, n, total);
        break;
      case "closing":
        addContentSlide(pptx, slide, n, total, true, undefined);
        break;
      default:
        addContentSlide(pptx, slide, n, total, false, resolved);
    }
  });

  const imageCount = images.size;
  const cloudArchCount = outline.slides.filter((s) => getSlideCloudArch(s)).length;

  const base64 = (await pptx.write({ outputType: "base64" })) as string;
  return {
    base64,
    fileName: sanitizeFileName(outline.documentTitle),
    imageCount,
    cloudArchCount,
  };
}
