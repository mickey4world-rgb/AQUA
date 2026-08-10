"use client";

import { useEffect, useState } from "react";
import { SHOWCASE_JUDICIAL_DOCS } from "@/lib/showcase-data";

export default function JudicialShowcaseDemo() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % SHOWCASE_JUDICIAL_DOCS.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="showcase-demo showcase-demo--judicial">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/80">
              Case Notebook
            </p>
            <p className="mt-0.5 text-sm text-white">架空サンプル事件 — 建物明渡</p>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            {String(active + 1).padStart(2, "0")} / {String(SHOWCASE_JUDICIAL_DOCS.length).padStart(2, "0")}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {SHOWCASE_JUDICIAL_DOCS.map((doc, index) => {
            const isActive = index === active;
            return (
              <div
                key={doc.id}
                className={`showcase-judicial-doc rounded-xl border px-3 py-2.5 transition-all duration-500 ${
                  isActive
                    ? "border-violet-400/35 bg-violet-500/10 scale-[1.02]"
                    : "border-white/8 bg-white/[0.03] opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{doc.label}</p>
                  <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-400">
                    {doc.tag}
                  </span>
                </div>
                <p
                  className={`mt-1.5 text-xs leading-relaxed text-slate-300 ${
                    isActive ? "showcase-typewriter" : ""
                  }`}
                >
                  {isActive ? doc.excerpt : "…"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/70">AI 整理</p>
          <p className="showcase-typewriter mt-2 text-xs leading-relaxed text-slate-300">
            争点: 修繕義務の有無 / 相殺の範囲 — 証拠説明書で立証計画を更新中…
          </p>
        </div>
      </div>
    </div>
  );
}
