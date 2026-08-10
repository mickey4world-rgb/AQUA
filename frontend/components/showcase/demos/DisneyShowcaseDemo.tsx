"use client";

import { useEffect, useState } from "react";
import { SHOWCASE_DISNEY_ATTRACTIONS } from "@/lib/showcase-data";

export default function DisneyShowcaseDemo() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setPhase((p) => p + 1), 2800);
    return () => window.clearInterval(timer);
  }, []);

  const crowdLevel = phase % 3 === 0 ? "やや混雑" : phase % 3 === 1 ? "混雑" : "空いている";
  const crowdColor =
    phase % 3 === 0 ? "text-amber-300" : phase % 3 === 1 ? "text-rose-300" : "text-emerald-300";

  return (
    <div className="showcase-demo showcase-demo--disney">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fuchsia-300/80">
              TDR Analytics
            </p>
            <p className="mt-0.5 text-sm text-white">東京ディズニーランド</p>
          </div>
          <div className="text-right">
            <p className={`text-xs font-medium ${crowdColor}`}>{crowdLevel}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">混雑予測 AI</p>
          </div>
        </div>

        <div className="showcase-disney-companion mt-4 flex items-center gap-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-2.5">
          <div className="showcase-mickey-head" aria-hidden />
          <p className="text-xs leading-relaxed text-slate-200">
            午後はランド中心に混雑が移ります。スペース・マウンテンは開園直後がおすすめ！
          </p>
        </div>

        <div className="mt-4 space-y-2.5">
          {SHOWCASE_DISNEY_ATTRACTIONS.map((attr, index) => {
            const animatedWait = Math.max(15, attr.wait + ((phase + index) % 3) * 8 - 8);
            const width = Math.min(100, (animatedWait / 100) * 100);
            return (
              <div key={attr.name}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">{attr.name}</span>
                  <span className="font-mono text-fuchsia-200">{animatedWait}分</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="showcase-wait-bar h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-sky-300"
                    style={{ width: `${width}%`, transition: "width 1.2s ease" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
