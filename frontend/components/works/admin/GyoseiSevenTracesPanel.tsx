"use client";

import type { SevenTraceLevel, SevenTracesBrief } from "@/lib/gyosei-seven-traces";

const LEVEL_STYLE: Record<
  SevenTraceLevel,
  { border: string; ink: string; badge: string }
> = {
  idle: {
    border: "border-white/10",
    ink: "text-slate-500",
    badge: "bg-white/5 text-slate-500",
  },
  info: {
    border: "border-sky-400/30",
    ink: "text-sky-100",
    badge: "bg-sky-500/20 text-sky-50",
  },
  watch: {
    border: "border-amber-400/35",
    ink: "text-amber-50",
    badge: "bg-amber-500/20 text-amber-50",
  },
  caution: {
    border: "border-rose-400/40",
    ink: "text-rose-50",
    badge: "bg-rose-500/25 text-rose-50",
  },
};

type Props = {
  brief: SevenTracesBrief;
  compact?: boolean;
};

export default function GyoseiSevenTracesPanel({ brief, compact = false }: Props) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-slate-950/35 ${compact ? "p-4" : "p-5 sm:p-6"}`}
      aria-labelledby="gyosei-seven-traces-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">
            七つの跡
          </p>
          <h3
            id="gyosei-seven-traces-heading"
            className="mt-1 text-lg font-semibold text-white sm:text-xl"
          >
            公開通帳に押す、監査のスタンプ
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
            支出データの範囲で疑うべき痕跡を定型印にしました。いまの範囲は
            <span className="text-slate-200"> {brief.scopeLabel}</span>
            （{brief.year}年度）。押印 {brief.pressedCount}/7 — 押されていない印も「問題なしの証明」ではなく、材料不足や閾値未満です。
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {brief.stamps.map((stamp) => {
          const style = LEVEL_STYLE[stamp.level];
          return (
            <article
              key={stamp.id}
              className={`rounded-2xl border px-3 py-3 ${style.border} ${
                stamp.pressed ? "bg-white/[0.06]" : "bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${style.badge}`}
                  >
                    {stamp.index}
                  </span>
                  <span className="text-xs font-semibold text-white">{stamp.title}</span>
                </div>
                <span className={`text-[10px] font-medium ${style.ink}`}>
                  {stamp.pressed ? "押印" : "未押印"}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">{stamp.question}</p>
              <p className={`mt-1 text-sm font-medium leading-snug ${style.ink}`}>
                {stamp.verdict}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{stamp.detail}</p>
              {stamp.metricLabel ? (
                <p className="mt-2 font-mono text-[10px] text-slate-500">
                  metric: {stamp.metricLabel}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
