"use client";

import CouncilAvatar, {
  resolveCouncilAvatarRole,
} from "@/components/council/CouncilAvatar";
import type { CouncilModelOpinion, CouncilPhase } from "@/lib/types/council";

const phaseLabels: Record<CouncilPhase, string> = {
  initial: "第1ラウンド",
  rebuttal: "第2ラウンド（議論）",
  synthesis: "合議まとめ",
  followup: "追加質問",
};

const modelColors: Record<string, string> = {
  logic: "border-emerald-400/30 bg-emerald-500/10",
  creative: "border-sky-400/30 bg-sky-500/10",
  skeptic: "border-amber-400/30 bg-amber-500/10",
  explorer: "border-fuchsia-400/30 bg-fuchsia-500/10",
  "gemini-explorer": "border-fuchsia-400/30 bg-fuchsia-500/10",
  judge: "border-violet-400/40 bg-violet-500/15",
  "judge-global": "border-violet-400/40 bg-violet-500/15",
  "global-a": "border-emerald-400/30 bg-emerald-500/10",
  "global-b": "border-sky-400/30 bg-sky-500/10",
  "global-c": "border-amber-400/30 bg-amber-500/10",
};

function providerLabel(provider?: CouncilModelOpinion["provider"]) {
  if (provider === "gemini") return "Gemini";
  if (provider === "openai") return "OpenAI";
  return "Azure";
}

function OpinionCard({
  opinion,
  highlight,
}: {
  opinion: CouncilModelOpinion;
  highlight?: boolean;
}) {
  const color =
    modelColors[opinion.modelId] ??
    (highlight ? modelColors.judge : "border-white/10 bg-white/5");
  const role = highlight
    ? "judge"
    : resolveCouncilAvatarRole(opinion.modelId, "logic");

  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CouncilAvatar
          role={role}
          label={opinion.modelLabel}
          mood="speaking"
          compact
        />
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {phaseLabels[opinion.phase]}
        </span>
      </div>
      {opinion.modelUsed && (
        <p className="mt-2 font-mono text-[10px] text-slate-500">
          {providerLabel(opinion.provider)} · {opinion.modelUsed}
        </p>
      )}
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
