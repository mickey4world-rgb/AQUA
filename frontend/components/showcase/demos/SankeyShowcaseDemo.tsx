"use client";

import Link from "next/link";
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
  const projectCount = SHOWCASE_SANKEY_NODES.filter((node) => node.kind === "project").length;

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
            nodes={SHOWCASE_SANKEY_NODES}
            links={SHOWCASE_SANKEY_LINKS}
            unit="億円"
            width={880}
            height={440}
            amountWeightedLinks
            fixedColumns
          />
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
