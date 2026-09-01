"use client";

import { useMemo } from "react";
import {
  sankey,
  type SankeyExtraProperties,
  type SankeyNode,
} from "d3-sankey";
import type { MoneyFlowLink, MoneyFlowNode } from "@/lib/types/gyosei";

type SankeyDiagramProps = {
  nodes: MoneyFlowNode[];
  links: MoneyFlowLink[];
  unit: string;
  width?: number;
  height?: number;
  onNodeClick?: (node: MoneyFlowNode) => void;
  /** 選択中ノードをハイライト */
  selectedNodeId?: string | null;
  /** リンク幅・不透明度を金額で強調 */
  amountWeightedLinks?: boolean;
  /** 流れアニメーション（ショーケース用） */
  flowAnimation?: boolean;
  /** 府省庁=2列目・事業=3列目・支出先=最右列に固定 */
  fixedColumns?: boolean;
};

type NodeExtra = MoneyFlowNode & SankeyExtraProperties;
type LinkExtra = { amount: number } & SankeyExtraProperties;

const KIND_COLOR: Record<MoneyFlowNode["kind"], string> = {
  government: "#67e8f9",
  ministry: "#5eead4",
  project: "#a5b4fc",
  payee: "#fcd34d",
  block: "#c4b5fd",
  year: "#93c5fd",
};

/** 1列目=国庫 … 2列目=府省庁 … 3列目=事業 … 最右=支出先 */
const KIND_COLUMN: Record<MoneyFlowNode["kind"], number> = {
  government: 0,
  ministry: 1,
  project: 2,
  block: 2,
  payee: 3,
  year: 0,
};

/** 常に4列（国庫・府省庁・事業・支出先）で均等配置 */
const FIXED_COLUMN_COUNT = 4;

function applyFixedColumns(
  nodes: NodeExtra[],
  nodeWidth: number,
  padding: number,
  width: number,
) {
  const usable = width - padding * 2 - nodeWidth;
  const step = usable / (FIXED_COLUMN_COUNT - 1);
  for (const node of nodes) {
    const col = KIND_COLUMN[node.kind];
    const x = padding + col * step;
    node.x0 = x;
    node.x1 = x + nodeWidth;
  }
}

function labelOnLeftSide(kind: MoneyFlowNode["kind"]): boolean {
  return KIND_COLUMN[kind] >= 2;
}

/** 帯状リンク（幅 = 流量）。ストローク線ではなく塗りつぶしで途切れない */
function sankeyLinkRibbon(
  link: {
    source: { x1?: number };
    target: { x0?: number };
    y0?: number;
    y1?: number;
    width?: number;
  },
): string {
  const x0 = link.source.x1 ?? 0;
  const x1 = link.target.x0 ?? 0;
  const y0 = link.y0 ?? 0;
  const y1 = link.y1 ?? 0;
  const w = Math.max(0.5, link.width ?? 1);
  const mx = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${mx},${y0} ${mx},${y1} ${x1},${y1}`,
    `L${x1},${y1 + w}`,
    `C${mx},${y1 + w} ${mx},${y0 + w} ${x0},${y0 + w}`,
    "Z",
  ].join(" ");
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function SankeyDiagram({
  nodes,
  links,
  unit,
  width = 960,
  height = 520,
  onNodeClick,
  selectedNodeId = null,
  amountWeightedLinks = false,
  flowAnimation = false,
  fixedColumns = true,
}: SankeyDiagramProps) {
  const maxLinkAmount = useMemo(
    () => Math.max(1, ...links.map((link) => link.amount)),
    [links],
  );
  const layout = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null;

    const available = new Set(nodes.map((node) => node.id));
    const graphNodes: NodeExtra[] = nodes.map((node) => ({ ...node }));
    const graphLinks: Array<LinkExtra & { source: string; target: string; value: number }> = links
      .filter((link) => available.has(link.source) && available.has(link.target))
      .map((link) => ({
        source: link.source,
        target: link.target,
        value: link.amount,
        amount: link.amount,
      }));

    if (graphLinks.length === 0) return null;

    const nodeWidth = 18;
    const padding = 20;
    const layoutFn = sankey<NodeExtra, LinkExtra>()
      .nodeId((node) => node.id)
      .nodeWidth(nodeWidth)
      .nodePadding(10)
      .nodeSort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .extent([
        [padding, padding],
        [width - padding, height - padding],
      ]);

    const result = layoutFn({
      nodes: graphNodes,
      links: graphLinks,
    });

    if (fixedColumns) {
      applyFixedColumns(result.nodes, nodeWidth, padding, width);
      if (typeof layoutFn.update === "function") {
        layoutFn.update(result);
      }
    }

    return result;
  }, [nodes, links, width, height, fixedColumns]);

  if (!layout) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
        表示できるお金の流れがありません。条件を緩めてみてください。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-w-[720px] w-full"
        role="img"
        aria-label="行政事業レビューのお金の流れサンキー図"
      >
        <g className="sankey-links">
          {layout.links.map((link, index) => {
            const source = link.source as SankeyNode<NodeExtra, LinkExtra>;
            const target = link.target as SankeyNode<NodeExtra, LinkExtra>;
            const weight = link.amount / maxLinkAmount;
            const baseColor = KIND_COLOR[source.kind];
            const fillOpacity = amountWeightedLinks
              ? 0.32 + weight * 0.38
              : 0.48;
            return (
              <path
                key={`link-${index}`}
                d={sankeyLinkRibbon(link as Parameters<typeof sankeyLinkRibbon>[0])}
                fill={hexToRgba(baseColor, fillOpacity)}
                stroke={hexToRgba(baseColor, Math.min(0.72, fillOpacity + 0.12))}
                strokeWidth={0.35}
                className={flowAnimation ? "showcase-sankey-link-flow" : undefined}
              >
                <title>
                  {`${source.label} → ${target.label}: ${formatAmount(link.amount)} ${unit}`}
                </title>
              </path>
            );
          })}
        </g>

        <g className="sankey-nodes">
          {layout.nodes.map((node) => {
          const color = KIND_COLOR[node.kind];
          const x0 = node.x0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y0 = node.y0 ?? 0;
          const y1 = node.y1 ?? 0;
          const labelOnRight = !labelOnLeftSide(node.kind);
          const isSelected = selectedNodeId === node.id;
          const clickable = Boolean(
            onNodeClick && (node.kind === "government" || node.drillable !== false),
          );
          return (
            <g
              key={node.id}
              transform={`translate(${x0},${y0})`}
              style={{ cursor: clickable ? "pointer" : "default" }}
              onClick={() => {
                if (clickable) onNodeClick?.(node);
              }}
            >
              <rect
                width={Math.max(1, x1 - x0)}
                height={Math.max(1, y1 - y0)}
                rx={3}
                fill={color}
                opacity={isSelected ? 1 : 0.9}
                stroke={isSelected ? "#ffffff" : "transparent"}
                strokeWidth={isSelected ? 2 : 0}
              >
                <title>
                  {`${node.label}: ${formatAmount(node.amount)} ${unit}${
                    clickable ? "（クリックで深掘り）" : ""
                  }`}
                </title>
              </rect>
              <text
                x={labelOnRight ? -8 : x1 - x0 + 8}
                y={(y1 - y0) / 2}
                dy="0.35em"
                textAnchor={labelOnRight ? "end" : "start"}
                className="fill-slate-200"
                style={{ fontSize: 11, pointerEvents: "none" }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
        </g>
      </svg>
    </div>
  );
}

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}兆`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}億`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}千`;
  return value.toLocaleString("ja-JP");
}
