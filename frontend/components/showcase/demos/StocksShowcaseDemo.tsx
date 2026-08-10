"use client";

import { useEffect, useState } from "react";
import { SHOWCASE_STOCKS } from "@/lib/showcase-data";

function Sparkline({ up }: { up: boolean }) {
  const points = up
    ? "4,28 12,22 20,24 28,14 36,16 44,8 52,10 60,4"
    : "4,8 12,12 20,10 28,18 36,16 44,22 52,20 60,26";
  return (
    <svg viewBox="0 0 64 32" className="h-8 w-16" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={up ? "#34d399" : "#f87171"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="showcase-sparkline"
      />
    </svg>
  );
}

export default function StocksShowcaseDemo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 2200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="showcase-demo showcase-demo--stocks">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-300/80">
            Stock Watch
          </p>
          <span className="font-mono text-[10px] text-emerald-300/80">
            {tick % 2 === 0 ? "● LIVE" : "○ REFRESH"}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {SHOWCASE_STOCKS.map((stock, index) => {
            const jitter = ((tick + index) % 3) * 0.15;
            const price = stock.price + (stock.change >= 0 ? jitter : -jitter);
            const up = stock.change >= 0;
            return (
              <div
                key={stock.symbol}
                className="showcase-stock-row flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                <div>
                  <p className="font-mono text-sm font-medium text-white">{stock.symbol}</p>
                  <p className="text-[11px] text-slate-400">
                    {stock.name} · {stock.market}
                  </p>
                </div>
                <Sparkline up={up} />
                <div className="text-right">
                  <p className="font-mono text-sm text-white">{price.toFixed(1)}</p>
                  <p className={`text-[11px] ${up ? "text-emerald-300" : "text-rose-300"}`}>
                    {up ? "+" : ""}
                    {stock.change}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">AI Advice</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-200">
            NVDA — ボラティリティ高。利確ラインの見直しを検討。
          </p>
        </div>
      </div>
    </div>
  );
}
