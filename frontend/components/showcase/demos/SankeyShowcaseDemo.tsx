"use client";

import dynamic from "next/dynamic";
import { SHOWCASE_SANKEY_LINKS, SHOWCASE_SANKEY_NODES } from "@/lib/showcase-data";

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

export default function SankeyShowcaseDemo() {
  return (
    <div className="showcase-demo showcase-demo--sankey">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Sankey
            </p>
            <p className="mt-0.5 text-sm text-slate-300">令和6年度 — 5省庁 × 12事業 × 15支出先</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
              総流 1.28兆円
            </span>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100">
              DRILL-DOWN
            </span>
          </div>
        </div>
        <div className="showcase-sankey-flow overflow-hidden p-1 sm:p-2">
          <SankeyDiagram
            nodes={SHOWCASE_SANKEY_NODES}
            links={SHOWCASE_SANKEY_LINKS}
            unit="億円"
            width={880}
            height={420}
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
        </div>
      </div>
    </div>
  );
}
