"use client";

import { useMemo } from "react";
import {
  sankey,
  sankeyLinkHorizontal,
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

export default function SankeyDiagram({
  nodes,
  links,
  unit,
  width = 960,
  height = 520,
  onNodeClick,
}: SankeyDiagramProps) {
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

    const layoutFn = sankey<NodeExtra, LinkExtra>()
      .nodeId((node) => node.id)
      .nodeWidth(16)
      .nodePadding(14)
      .extent([
        [16, 16],
        [width - 16, height - 16],
      ]);

    return layoutFn({
      nodes: graphNodes,
      links: graphLinks,
    });
  }, [nodes, links, width, height]);

  if (!layout) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
        表示できるお金の流れがありません。条件を緩めてみてください。
      </div>
    );
  }

  const path = sankeyLinkHorizontal();

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-w-[720px] w-full"
        role="img"
        aria-label="行政事業レビューのお金の流れサンキー図"
      >
        <defs>
          <linearGradient id="link-fade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(103,232,249,0.35)" />
            <stop offset="100%" stopColor="rgba(252,211,77,0.28)" />
          </linearGradient>
        </defs>

        {layout.links.map((link, index) => {
          const source = link.source as SankeyNode<NodeExtra, LinkExtra>;
          const target = link.target as SankeyNode<NodeExtra, LinkExtra>;
          return (
            <path
              key={`link-${index}`}
              d={path(link) ?? undefined}
              fill="none"
              stroke="url(#link-fade)"
              strokeOpacity={0.55}
              strokeWidth={Math.max(1.2, link.width ?? 1)}
            >
              <title>
                {`${source.label} → ${target.label}: ${formatAmount(link.amount)} ${unit}`}
              </title>
            </path>
          );
        })}

        {layout.nodes.map((node) => {
          const color = KIND_COLOR[node.kind];
          const x0 = node.x0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y0 = node.y0 ?? 0;
          const y1 = node.y1 ?? 0;
          const labelOnRight = x0 > width * 0.55;
          const clickable = Boolean(onNodeClick && node.drillable !== false && node.kind !== "government");
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
                opacity={0.9}
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
