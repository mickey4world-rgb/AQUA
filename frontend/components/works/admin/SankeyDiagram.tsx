"use client";

import { useId, useMemo } from "react";
import {
  sankey,
  sankeyLinkHorizontal,
  type SankeyExtraProperties,
  type SankeyLink,
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
  selectedNodeId?: string | null;
  amountWeightedLinks?: boolean;
  flowAnimation?: boolean;
  fixedColumns?: boolean;
};

type NodeExtra = MoneyFlowNode & SankeyExtraProperties;
type LinkExtra = { amount: number } & SankeyExtraProperties;

type LayoutResult =
  | {
      ok: true;
      nodes: SankeyNode<NodeExtra, LinkExtra>[];
      links: SankeyLink<NodeExtra, LinkExtra>[];
      height: number;
    }
  | { ok: false; message: string };

const KIND_COLOR: Record<MoneyFlowNode["kind"], string> = {
  government: "#67e8f9",
  ministry: "#5eead4",
  project: "#a5b4fc",
  payee: "#fcd34d",
  block: "#c4b5fd",
  year: "#93c5fd",
};

const KIND_COLUMN: Record<MoneyFlowNode["kind"], number> = {
  government: 0,
  ministry: 1,
  project: 2,
  block: 2,
  payee: 3,
  year: 0,
};

const COLUMN_LABELS = ["国庫", "府省庁", "事業", "支出先"];
const FIXED_COLUMN_COUNT = 4;
const MAX_LAYOUT_LINKS = 160;

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

function truncateLabel(label: string, max = 14): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function computeHeight(nodeCount: number, baseHeight: number): number {
  const adaptive = Math.max(460, nodeCount * 16);
  return Math.min(860, Math.max(baseHeight, adaptive));
}

function buildLayout(
  nodes: MoneyFlowNode[],
  links: MoneyFlowLink[],
  width: number,
  baseHeight: number,
  fixedColumns: boolean,
): LayoutResult {
  if (nodes.length === 0 || links.length === 0) {
    return { ok: false, message: "表示できるお金の流れがありません。" };
  }

  if (links.length > MAX_LAYOUT_LINKS) {
    return {
      ok: false,
      message: "表示対象が多すぎます。府省庁や支出先で絞り込んでください。",
    };
  }

  try {
    const available = new Set(nodes.map((node) => node.id));
    const graphNodes: NodeExtra[] = nodes.map((node) => ({ ...node }));
    const graphLinks = links
      .filter((link) => available.has(link.source) && available.has(link.target))
      .map((link) => ({
        source: link.source,
        target: link.target,
        value: Math.max(0.001, link.amount),
        amount: link.amount,
      }));

    if (graphLinks.length === 0) {
      return { ok: false, message: "リンクを構成できませんでした。" };
    }

    const nodeWidth = 16;
    const padding = 28;
    const height = computeHeight(graphNodes.length, baseHeight);
    const layoutFn = sankey<NodeExtra, LinkExtra>()
      .nodeId((node) => node.id)
      .nodeWidth(nodeWidth)
      .nodePadding(16)
      .nodeSort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
      .extent([
        [padding, padding + 18],
        [width - padding, height - padding],
      ]);

    const result = layoutFn({
      nodes: graphNodes,
      links: graphLinks,
    });

    if (fixedColumns) {
      applyFixedColumns(result.nodes, nodeWidth, padding, width);
    }

    const sortedLinks = [...result.links].sort(
      (a, b) => (a.width ?? 0) - (b.width ?? 0),
    );

    return {
      ok: true,
      nodes: result.nodes,
      links: sortedLinks,
      height,
    };
  } catch {
    return { ok: false, message: "サンキー図のレイアウトに失敗しました。" };
  }
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
  const gradientId = useId().replace(/:/g, "");
  const layout = useMemo(
    () => buildLayout(nodes, links, width, height, fixedColumns),
    [nodes, links, width, height, fixedColumns],
  );

  const maxLinkAmount = useMemo(
    () => Math.max(1, ...links.map((link) => link.amount)),
    [links],
  );

  if (!layout.ok) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] px-6 text-center text-sm text-slate-500">
        {layout.message}
      </div>
    );
  }

  const path = sankeyLinkHorizontal();
  const columnStep = (width - 56 - 16) / (FIXED_COLUMN_COUNT - 1);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${layout.height}`}
        className="h-auto min-w-[720px] w-full"
        role="img"
        aria-label="行政事業レビューのお金の流れサンキー図"
      >
        <defs>
          <linearGradient id={`${gradientId}-flow`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#a5b4fc" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fcd34d" stopOpacity="0.52" />
          </linearGradient>
        </defs>

        {COLUMN_LABELS.map((label, index) => {
          const x = 28 + index * columnStep + (index === FIXED_COLUMN_COUNT - 1 ? 16 : 0);
          return (
            <text
              key={label}
              x={x}
              y={18}
              textAnchor={index >= 2 ? "start" : "middle"}
              className="fill-slate-500"
              style={{ fontSize: 10, letterSpacing: "0.08em" }}
            >
              {label}
            </text>
          );
        })}

        {Array.from({ length: FIXED_COLUMN_COUNT }, (_, index) => {
          const x = 28 + index * columnStep;
          return (
            <line
              key={`guide-${index}`}
              x1={x}
              y1={24}
              x2={x}
              y2={layout.height - 24}
              stroke="rgba(148,163,184,0.08)"
              strokeDasharray="3 5"
            />
          );
        })}

        <g className="sankey-links">
          {layout.links.map((link, index) => {
            const source = link.source as SankeyNode<NodeExtra, LinkExtra>;
            const target = link.target as SankeyNode<NodeExtra, LinkExtra>;
            const weight = link.amount / maxLinkAmount;
            const strokeOpacity = amountWeightedLinks
              ? 0.28 + weight * 0.62
              : 0.52;
            const strokeWidth = amountWeightedLinks
              ? Math.max(1.5, (link.width ?? 1) * (0.9 + weight * 0.25))
              : Math.max(1.4, link.width ?? 1);

            return (
              <path
                key={`link-${index}`}
                d={path(link) ?? undefined}
                fill="none"
                stroke={`url(#${gradientId}-flow)`}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
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
            const nodeHeight = Math.max(2, y1 - y0);
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
                  height={nodeHeight}
                  rx={4}
                  fill={color}
                  opacity={isSelected ? 1 : 0.92}
                  stroke={isSelected ? "#ffffff" : "rgba(15,23,42,0.35)"}
                  strokeWidth={isSelected ? 2 : 0.6}
                >
                  <title>
                    {`${node.label}: ${formatAmount(node.amount)} ${unit}${
                      clickable ? "（クリックで深掘り）" : ""
                    }`}
                  </title>
                </rect>
                <text
                  x={labelOnRight ? -10 : x1 - x0 + 10}
                  y={nodeHeight / 2}
                  dy="0.35em"
                  textAnchor={labelOnRight ? "end" : "start"}
                  className="fill-slate-100"
                  style={{ fontSize: 11, fontWeight: 500, pointerEvents: "none" }}
                >
                  {truncateLabel(node.label)}
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
