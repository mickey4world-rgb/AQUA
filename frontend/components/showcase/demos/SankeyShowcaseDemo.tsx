"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { MoneyFlowNode } from "@/lib/types/gyosei";
import {
  SHOWCASE_PAYEE_DETAILS,
  SHOWCASE_SANKEY_LINKS,
  SHOWCASE_SANKEY_NODES,
  type ShowcasePayeeDetail,
} from "@/lib/showcase-data";

const SankeyDiagram = dynamic(
  () => import("@/components/works/admin/SankeyDiagram"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
        サンキー図を描画中…
      </div>
    ),
  },
);

function fallbackPayeeDetail(node: MoneyFlowNode): ShowcasePayeeDetail {
  const incoming = SHOWCASE_SANKEY_LINKS.filter((link) => link.target === node.id);
  return {
    id: node.id,
    name: node.label,
    totalAmount: node.amount,
    summary: `${node.label} への支出フロー。リンクの太さが金額の強弱を表します。`,
    contracts: incoming.map((link) => {
      const project = SHOWCASE_SANKEY_NODES.find((n) => n.id === link.source);
      const ministryLink = project
        ? SHOWCASE_SANKEY_LINKS.find((l) => l.target === project.id)
        : undefined;
      const ministry = ministryLink
        ? SHOWCASE_SANKEY_NODES.find((n) => n.id === ministryLink.source)
        : undefined;
      return {
        ministry: ministry?.label ?? "—",
        project: project?.label ?? link.source,
        amount: link.amount,
        fiscalYear: "R6",
      };
    }),
  };
}

function PayeeDetailPanel({
  detail,
  onClose,
}: {
  detail: ShowcasePayeeDetail;
  onClose: () => void;
}) {
  return (
    <div className="showcase-payee-detail mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/80">
            支出先詳細
          </p>
          <h3 className="mt-1 text-base font-medium text-white">{detail.name}</h3>
          <p className="mt-1 font-mono text-sm text-amber-100">
            受注合計 {detail.totalAmount.toLocaleString("ja-JP")} 億円
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-white/10"
        >
          閉じる
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-300">{detail.summary}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="pb-2 pr-4 font-medium">省庁</th>
              <th className="pb-2 pr-4 font-medium">事業</th>
              <th className="pb-2 pr-4 font-medium">金額</th>
              <th className="pb-2 font-medium">備考</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {detail.contracts.map((row) => (
              <tr key={`${row.ministry}-${row.project}`}>
                <td className="py-2 pr-4 text-slate-200">{row.ministry}</td>
                <td className="py-2 pr-4 text-slate-300">{row.project}</td>
                <td className="py-2 pr-4 font-mono text-amber-200">{row.amount}億</td>
                <td className="py-2 text-slate-400">{row.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SankeyShowcaseDemo() {
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>("corp-g");

  const selectedDetail = useMemo(() => {
    if (!selectedPayeeId) return null;
    return (
      SHOWCASE_PAYEE_DETAILS[selectedPayeeId] ??
      fallbackPayeeDetail(
        SHOWCASE_SANKEY_NODES.find((n) => n.id === selectedPayeeId) ?? {
          id: selectedPayeeId,
          label: selectedPayeeId,
          kind: "payee",
          amount: 0,
        },
      )
    );
  }, [selectedPayeeId]);

  function handleNodeClick(node: MoneyFlowNode) {
    if (node.kind === "payee") {
      setSelectedPayeeId(node.id);
    }
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
              令和6年度 — 内閣府×厚労 / 国交×防衛 の合流フロー
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
              総流 1.28兆円
            </span>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100">
              企業クリックで詳細
            </span>
          </div>
        </div>
        <div className="showcase-sankey-flow overflow-hidden p-1 sm:p-2">
          <SankeyDiagram
            nodes={SHOWCASE_SANKEY_NODES}
            links={SHOWCASE_SANKEY_LINKS}
            unit="億円"
            width={880}
            height={440}
            selectedNodeId={selectedPayeeId}
            amountWeightedLinks
            flowAnimation
            onNodeClick={handleNodeClick}
          />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-2.5">
          {[
            { label: "国庫", color: "#67e8f9" },
            { label: "省庁", color: "#5eead4" },
            { label: "事業", color: "#a5b4fc" },
            { label: "支出先", color: "#fcd34d" },
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
          <span className="text-[10px] text-slate-500">· リンク太さ＝金額の強弱</span>
        </div>
        {selectedDetail && (
          <div className="px-4 pb-4">
            <PayeeDetailPanel
              detail={selectedDetail}
              onClose={() => setSelectedPayeeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
