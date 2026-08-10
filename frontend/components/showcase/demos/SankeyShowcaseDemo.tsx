"use client";

import dynamic from "next/dynamic";
import { SHOWCASE_SANKEY_LINKS, SHOWCASE_SANKEY_NODES } from "@/lib/showcase-data";

const SankeyDiagram = dynamic(
  () => import("@/components/works/admin/SankeyDiagram"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
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
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Sankey
            </p>
            <p className="mt-0.5 text-sm text-slate-300">令和6年度 — お金の流れ</p>
          </div>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100">
            LIVE
          </span>
        </div>
        <div className="showcase-sankey-flow p-2">
          <SankeyDiagram
            nodes={SHOWCASE_SANKEY_NODES}
            links={SHOWCASE_SANKEY_LINKS}
            unit="億円"
            width={720}
            height={300}
          />
        </div>
      </div>
    </div>
  );
}
