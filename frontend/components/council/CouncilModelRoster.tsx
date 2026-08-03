"use client";

import type { CouncilModelMeta } from "@/lib/types/council";

type CouncilModelRosterProps = {
  title: string;
  models: CouncilModelMeta[];
  judge?: CouncilModelMeta;
};

function ModelChip({ model, variant }: { model: CouncilModelMeta; variant?: "judge" }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        variant === "judge"
          ? "border-violet-400/30 bg-violet-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <p className="text-xs font-medium text-white">{model.label}</p>
      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
        {model.displayName ?? model.model ?? model.deployment ?? "—"}
      </p>
    </div>
  );
}

export default function CouncilModelRoster({ title, models, judge }: CouncilModelRosterProps) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-300">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {models.map((model) => (
          <ModelChip key={model.id} model={model} />
        ))}
        {judge && <ModelChip model={judge} variant="judge" />}
      </div>
    </div>
  );
}
