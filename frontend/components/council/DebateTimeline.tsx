"use client";

import type { CouncilModelOpinion } from "@/lib/types/council";

const phaseLabels = {
  initial: "第1ラウンド",
  rebuttal: "第2ラウンド（議論）",
  synthesis: "合議まとめ",
} as const;

const modelColors: Record<string, string> = {
  logic: "border-emerald-400/30 bg-emerald-500/10",
  creative: "border-sky-400/30 bg-sky-500/10",
  skeptic: "border-amber-400/30 bg-amber-500/10",
  judge: "border-violet-400/40 bg-violet-500/15",
  "global-openai-a": "border-emerald-400/30 bg-emerald-500/10",
  "global-openai-b": "border-sky-400/30 bg-sky-500/10",
  "global-openai-c": "border-amber-400/30 bg-amber-500/10",
};

function OpinionCard({ opinion, highlight }: { opinion: CouncilModelOpinion; highlight?: boolean }) {
  const color =
    modelColors[opinion.modelId] ??
    (highlight ? modelColors.judge : "border-white/10 bg-white/5");

  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">{opinion.modelLabel}</p>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {phaseLabels[opinion.phase]}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
        {opinion.content}
      </p>
    </div>
  );
}

type DebateTimelineProps = {
  initial: CouncilModelOpinion[];
  rebuttal: CouncilModelOpinion[];
  synthesis: CouncilModelOpinion;
};

export default function DebateTimeline({
  initial,
  rebuttal,
  synthesis,
}: DebateTimelineProps) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/80">
          各 AI の要点
        </h3>
        <div className="mt-3 space-y-3">
          {initial.map((opinion) => (
            <OpinionCard key={`${opinion.modelId}-initial`} opinion={opinion} />
          ))}
        </div>
      </section>

      {rebuttal.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300/80">
            第2ラウンド — AI 同士の議論
          </h3>
          <div className="mt-3 space-y-3">
            {rebuttal.map((opinion) => (
              <OpinionCard key={`${opinion.modelId}-rebuttal`} opinion={opinion} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300/80">
          合議まとめ
        </h3>
        <div className="mt-3">
          <OpinionCard opinion={synthesis} highlight />
        </div>
      </section>
    </div>
  );
}
