import type { SankeyExtraProperties, SankeyLink, SankeyNode } from "d3-sankey";
import type { MoneyFlowLink, MoneyFlowNode } from "@/lib/types/gyosei";

export type FixedLayoutNode = MoneyFlowNode &
  SankeyExtraProperties & {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    column: number;
  };

export type FixedLayoutLink = {
  source: string;
  target: string;
  amount: number;
} & SankeyExtraProperties;

const KIND_COLUMN: Record<MoneyFlowNode["kind"], number> = {
  government: 0,
  ministry: 1,
  project: 2,
  block: 2,
  payee: 3,
  year: 0,
};

const MIN_NODE_HEIGHT: Partial<Record<MoneyFlowNode["kind"], number>> = {
  ministry: 24,
  project: 22,
  payee: 30,
  block: 22,
};

const COLUMN_COUNT = 4;

function sumAmount(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** 最小高さを保ちつつ、金額比例で縦幅を配分する */
function distributeHeights(
  amounts: number[],
  available: number,
  minHeights: number[],
): number[] | null {
  const total = sumAmount(amounts);
  if (total <= 0 || amounts.length === 0) return null;

  const count = amounts.length;
  const minTotal = sumAmount(minHeights);
  if (available < minTotal) return null;

  const heights = amounts.map((amount) => (amount / total) * available);
  const locked = new Array<boolean>(count).fill(false);

  for (let pass = 0; pass < count + 2; pass += 1) {
    let deficit = 0;
    for (let index = 0; index < count; index += 1) {
      if (!locked[index] && heights[index] < minHeights[index]) {
        deficit += minHeights[index] - heights[index];
        heights[index] = minHeights[index];
        locked[index] = true;
      }
    }
    if (deficit <= 0.01) break;

    const freeIndices = heights
      .map((_, index) => index)
      .filter((index) => !locked[index]);
    const freeHeight = freeIndices.reduce((sum, index) => sum + heights[index], 0);
    if (freeHeight <= deficit + 0.01) return null;

    for (const index of freeIndices) {
      heights[index] -= deficit * (heights[index] / freeHeight);
    }
  }

  return heights;
}

function columnMinHeight(kind: MoneyFlowNode["kind"]): number {
  return MIN_NODE_HEIGHT[kind] ?? 20;
}

function computeBandHeight(
  columnNodes: MoneyFlowNode[][],
  minBand: number,
  maxBand: number,
): number {
  let bandHeight = minBand;

  while (bandHeight <= maxBand) {
    let fits = true;
    for (const nodes of columnNodes) {
      if (nodes.length === 0) continue;
      if (nodes.length === 1 && nodes[0].kind === "government") continue;

      const padding = Math.max(0, nodes.length - 1) * NODE_GAP;
      const available = bandHeight - padding;
      const heights = distributeHeights(
        nodes.map((node) => node.amount),
        available,
        nodes.map((node) => columnMinHeight(node.kind)),
      );
      if (!heights) {
        fits = false;
        break;
      }
    }
    if (fits) return bandHeight;
    bandHeight += 36;
  }

  return maxBand;
}

const NODE_GAP = 8;

export type FixedColumnLayoutInput = {
  nodes: MoneyFlowNode[];
  links: MoneyFlowLink[];
  width: number;
  baseHeight: number;
  nodeWidth?: number;
  padding?: number;
  labelMarginRight?: number;
};

export type FixedColumnLayoutResult = {
  nodes: SankeyNode<FixedLayoutNode, FixedLayoutLink>[];
  links: SankeyLink<FixedLayoutNode, FixedLayoutLink>[];
  height: number;
  bandTop: number;
  bandHeight: number;
};

export function buildFixedColumnLayout(
  input: FixedColumnLayoutInput,
): FixedColumnLayoutResult | null {
  const {
    nodes,
    links,
    width,
    baseHeight,
    nodeWidth = 18,
    padding = 28,
    labelMarginRight = 196,
  } = input;

  const available = new Set(nodes.map((node) => node.id));
  const graphLinks = links.filter(
    (link) =>
      link.amount > 0 && available.has(link.source) && available.has(link.target),
  );
  if (graphLinks.length === 0) return null;

  const columns: MoneyFlowNode[][] = Array.from({ length: COLUMN_COUNT }, () => []);
  for (const node of nodes) {
    columns[KIND_COLUMN[node.kind]].push(node);
  }

  for (const column of columns) {
    column.sort((a, b) => b.amount - a.amount);
  }

  const minBand = Math.max(420, baseHeight - padding * 2 - 24);
  const maxBand = Math.max(960, minBand + 360);
  const bandHeight = computeBandHeight(columns, minBand, maxBand);
  const bandTop = padding + 24;

  const usableWidth = width - padding * 2 - labelMarginRight - nodeWidth;
  const columnStep = usableWidth / (COLUMN_COUNT - 1);

  const layoutNodes: FixedLayoutNode[] = [];

  for (let columnIndex = 0; columnIndex < COLUMN_COUNT; columnIndex += 1) {
    const column = columns[columnIndex];
    const x = padding + columnIndex * columnStep;

    if (column.length === 0) continue;

    if (column.length === 1 && column[0].kind === "government") {
      layoutNodes.push({
        ...column[0],
        column: columnIndex,
        x0: x,
        x1: x + nodeWidth,
        y0: bandTop,
        y1: bandTop + bandHeight,
      });
      continue;
    }

    const gapTotal = Math.max(0, column.length - 1) * NODE_GAP;
    const availableHeight = bandHeight - gapTotal;
    const heights =
      distributeHeights(
        column.map((node) => node.amount),
        availableHeight,
        column.map((node) => columnMinHeight(node.kind)),
      ) ??
      column.map(() => availableHeight / column.length);

    let y = bandTop;
    for (let index = 0; index < column.length; index += 1) {
      const node = column[index];
      const height = heights[index];
      layoutNodes.push({
        ...node,
        column: columnIndex,
        x0: x,
        x1: x + nodeWidth,
        y0: y,
        y1: y + height,
      });
      y += height + NODE_GAP;
    }
  }

  const nodeById = new Map(layoutNodes.map((node) => [node.id, node]));

  type MutableLink = FixedLayoutLink & {
    sourceNode: FixedLayoutNode;
    targetNode: FixedLayoutNode;
    y0: number;
    y1: number;
    width: number;
  };

  const mutableLinks: MutableLink[] = graphLinks
    .map((link) => {
      const sourceNode = nodeById.get(link.source);
      const targetNode = nodeById.get(link.target);
      if (!sourceNode || !targetNode) return null;
      return {
        source: link.source,
        target: link.target,
        amount: link.amount,
        sourceNode,
        targetNode,
        y0: 0,
        y1: 0,
        width: 1,
      };
    })
    .filter((link): link is MutableLink => link !== null);

  const sourceOffsets = new Map<string, number>();
  const targetOffsets = new Map<string, number>();

  for (const node of layoutNodes) {
    sourceOffsets.set(node.id, 0);
    targetOffsets.set(node.id, 0);
  }

  const outgoingByNode = new Map<string, MutableLink[]>();
  const incomingByNode = new Map<string, MutableLink[]>();
  for (const link of mutableLinks) {
    const outgoing = outgoingByNode.get(link.source) ?? [];
    outgoing.push(link);
    outgoingByNode.set(link.source, outgoing);

    const incoming = incomingByNode.get(link.target) ?? [];
    incoming.push(link);
    incomingByNode.set(link.target, incoming);
  }

  const nodeSortKey = (node: FixedLayoutNode) => node.y0 + node.y1;

  for (const [, nodeLinks] of outgoingByNode) {
    nodeLinks.sort(
      (a, b) => nodeSortKey(a.targetNode) - nodeSortKey(b.targetNode),
    );
  }
  for (const [, nodeLinks] of incomingByNode) {
    nodeLinks.sort(
      (a, b) => nodeSortKey(a.sourceNode) - nodeSortKey(b.sourceNode),
    );
  }

  for (const node of layoutNodes) {
    const outTotal = sumAmount(
      (outgoingByNode.get(node.id) ?? []).map((link) => link.amount),
    );
    const inTotal = sumAmount(
      (incomingByNode.get(node.id) ?? []).map((link) => link.amount),
    );
    const nodeHeight = Math.max(1, node.y1 - node.y0);
    node.value = node.amount;
    node.sourceLinks = [];
    node.targetLinks = [];

    for (const link of outgoingByNode.get(node.id) ?? []) {
      const share = outTotal > 0 ? link.amount / outTotal : 0;
      const slice = Math.max(1, share * nodeHeight);
      const offset = sourceOffsets.get(node.id) ?? 0;
      link.width = slice;
      link.y0 = node.y0 + offset + slice / 2;
      sourceOffsets.set(node.id, offset + slice);
    }

    for (const link of incomingByNode.get(node.id) ?? []) {
      const share = inTotal > 0 ? link.amount / inTotal : 0;
      const slice = Math.max(1, share * nodeHeight);
      const offset = targetOffsets.get(node.id) ?? 0;
      link.y1 = node.y0 + offset + slice / 2;
      targetOffsets.set(node.id, offset + slice);
    }
  }

  const sankeyLinks = mutableLinks
    .map((link) => ({
      source: link.sourceNode as SankeyNode<FixedLayoutNode, FixedLayoutLink>,
      target: link.targetNode as SankeyNode<FixedLayoutNode, FixedLayoutLink>,
      amount: link.amount,
      value: link.amount,
      y0: link.y0,
      y1: link.y1,
      width: link.width,
    }))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));

  return {
    nodes: layoutNodes as SankeyNode<FixedLayoutNode, FixedLayoutLink>[],
    links: sankeyLinks as SankeyLink<FixedLayoutNode, FixedLayoutLink>[],
    height: bandTop + bandHeight + padding,
    bandTop,
    bandHeight,
  };
}
