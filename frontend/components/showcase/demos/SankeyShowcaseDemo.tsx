"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GyoseiFiveMirrorsPanel from "@/components/works/admin/GyoseiFiveMirrorsPanel";
import MoneyFlowSelectionPanel from "@/components/works/admin/MoneyFlowSelectionPanel";
import SankeyDiagram from "@/components/works/admin/SankeyDiagram";
import {
  buildFiveMirrorsBrief,
  fiveMirrorsFocusDescription,
  fiveMirrorsSankeyLegend,
  type FiveMirrorId,
} from "@/lib/gyosei-five-mirrors";
import {
  SHOWCASE_MONEY_FLOW_RESPONSE,
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
} from "@/lib/works-money-flow-ui";

const ROW_LIMIT = 6;

export default function SankeyShowcaseDemo() {
  const [selectedNode, setSelectedNode] = useState<MoneyFlowNode | null>(null);
  const [activeMirror, setActiveMirror] = useState<FiveMirrorId | null>(null);
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

  const fiveMirrors = useMemo(
    () => buildFiveMirrorsBrief(SHOWCASE_MONEY_FLOW_RESPONSE, selectedNode),
    [selectedNode],
  );
  const mirrorFocus = activeMirror ?? fiveMirrors.activeMirror;

  function handleNodeClick(node: MoneyFlowNode) {
    if (node.kind === "government") {
      setSelectedNode(null);
      setActiveMirror("source");
      return;
    }
    setSelectedNode((current) => {
      const next = current?.id === node.id ? null : node;
      if (!next) setActiveMirror("source");
      else if (next.kind === "payee") setActiveMirror("landing");
      else if (next.kind === "ministry" || next.kind === "project") setActiveMirror("source");
      else setActiveMirror("volume");
      return next;
    });
  }

  return (
    <div className="showcase-demo showcase-demo--sankey">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              公開五鏡
            </p>
            <p className="mt-0.5 text-sm text-slate-300">
              誰→いくら→誰へ · 事業 {projectCount} 件（架空デモ）
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              {fiveMirrorsFocusDescription(selectedNode, fiveMirrors)}
            </p>
          </div>
          <Link
            href="/works-preview"
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[10px] text-cyan-100 transition hover:bg-cyan-500/20"
          >
            無料レビューを見る →
          </Link>
        </div>

        <div className="border-b border-white/10 px-3 py-3">
          <GyoseiFiveMirrorsPanel
            brief={fiveMirrors}
            activeMirror={mirrorFocus}
            onSelectMirror={setActiveMirror}
            compact
          />
        </div>

        <div className="showcase-sankey-flow overflow-hidden p-1 sm:p-2">
          <SankeyDiagram
            nodes={sankeyGraph.nodes}
            links={sankeyGraph.links}
            unit="億円"
            width={1040}
            height={480}
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
              onClear={() => {
                setSelectedNode(null);
                setActiveMirror("source");
              }}
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
          {fiveMirrorsSankeyLegend().map((item) => (
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
