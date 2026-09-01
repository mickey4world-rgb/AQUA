"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MoneyFlowSelectionPanel from "@/components/works/admin/MoneyFlowSelectionPanel";
import SankeyDiagram from "@/components/works/admin/SankeyDiagram";
import {
  SHOWCASE_SANKEY_LINKS,
  SHOWCASE_SANKEY_NODES,
  SHOWCASE_SANKEY_ROWS,
} from "@/lib/showcase-data";
import type { MoneyFlowNode } from "@/lib/types/gyosei";
import {
  buildNodeSelectionSummary,
  filterRowsBySelectedNode,
  formatMoneyFlowAmount,
  resolveSankeyGraphData,
  sankeyFocusDescription,
} from "@/lib/works-money-flow-ui";

const ROW_LIMIT = 6;

export default function SankeyShowcaseDemo() {
  const [selectedNode, setSelectedNode] = useState<MoneyFlowNode | null>(null);
  const projectCount = SHOWCASE_SANKEY_NODES.filter((node) => node.kind === "project").length;

  const sankeyGraph = useMemo(
    () => resolveSankeyGraphData(SHOWCASE_SANKEY_NODES, SHOWCASE_SANKEY_LINKS, selectedNode),
    [selectedNode],
  );

  const filteredRows = useMemo(
    () => filterRowsBySelectedNode(SHOWCASE_SANKEY_ROWS, selectedNode),
    [selectedNode],
  );

  const selectionSummary = useMemo(() => {
    if (!selectedNode) return null;
    return buildNodeSelectionSummary(
      selectedNode,
      SHOWCASE_SANKEY_ROWS,
      SHOWCASE_SANKEY_LINKS,
      SHOWCASE_SANKEY_NODES,
    );
  }, [selectedNode]);

  function handleNodeClick(node: MoneyFlowNode) {
    if (node.kind === "government") {
      setSelectedNode(null);
      return;
    }
    setSelectedNode((current) => (current?.id === node.id ? null : node));
  }

  return (
    <div className="showcase-demo showcase-demo--sankey">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Sankey
            </p>
            <p className="mt-0.5 text-sm text-slate-300">
              府省庁 → 主要事業 {projectCount} 件 → 支出先
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              {sankeyFocusDescription(selectedNode)}
            </p>
          </div>
          <Link
            href="/works-preview"
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[10px] text-cyan-100 transition hover:bg-cyan-500/20"
          >
            無料レビューを見る →
          </Link>
        </div>
        <div className="showcase-sankey-flow overflow-hidden p-1 sm:p-2">
          <SankeyDiagram
            nodes={sankeyGraph.nodes}
            links={sankeyGraph.links}
            unit="億円"
            width={880}
            height={440}
            amountWeightedLinks
            fixedColumns
            selectedNodeId={selectedNode?.id ?? null}
            onNodeClick={handleNodeClick}
          />
        </div>
        {selectionSummary ? (
          <div className="border-t border-white/10 px-4 py-3">
            <MoneyFlowSelectionPanel
              summary={selectionSummary}
              unit="億円"
              onClear={() => setSelectedNode(null)}
            />
          </div>
        ) : null}
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">明細（デモ）</p>
          <p className="mt-1 text-[10px] text-slate-500">
            {selectedNode && selectionSummary
              ? `${selectionSummary.kindLabel}「${selectionSummary.name}」に関連`
              : "契約明細（金額の大きい順）"}
            {" · "}
            {filteredRows.length} 件
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-[10px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-medium">府省庁</th>
                  <th className="px-2 py-1 font-medium">事業</th>
                  <th className="px-2 py-1 font-medium">支出先</th>
                  <th className="px-2 py-1 font-medium text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, ROW_LIMIT).map((row, index) => (
                  <tr key={`${row.project}-${row.payee}-${index}`} className="text-slate-300">
                    <td className="px-2 py-1 whitespace-nowrap">{row.ministry}</td>
                    <td className="px-2 py-1 max-w-[8rem] truncate" title={row.project}>
                      {row.project}
                    </td>
                    <td className="px-2 py-1 max-w-[8rem] truncate" title={row.payee}>
                      {row.payee}
                    </td>
                    <td className="px-2 py-1 text-right font-mono whitespace-nowrap text-cyan-100/90">
                      {formatMoneyFlowAmount(row.amount, "億円")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-2.5">
          {[
            { label: "国庫", color: "#67e8f9" },
            { label: "府省庁（2列目）", color: "#5eead4" },
            { label: "事業（3列目）", color: "#a5b4fc" },
            { label: "支出先（最右）", color: "#fcd34d" },
          ].map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 text-[10px] text-slate-400"
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: item.color }}
                aria-hidden
              />
              {item.label}
            </span>
          ))}
          <span className="text-[10px] text-slate-500">· デモは架空データ</span>
        </div>
      </div>
    </div>
  );
}
