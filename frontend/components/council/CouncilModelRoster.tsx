"use client";

import CouncilAvatar, {
  resolveCouncilAvatarRole,
  type CouncilAvatarMood,
} from "@/components/council/CouncilAvatar";
import type { CouncilModelMeta } from "@/lib/types/council";

type CouncilModelRosterProps = {
  title: string;
  models: CouncilModelMeta[];
  judge?: CouncilModelMeta;
  mood?: CouncilAvatarMood;
};

function ModelChip({
  model,
  variant,
  mood = "idle",
}: {
  model: CouncilModelMeta;
  variant?: "judge";
  mood?: CouncilAvatarMood;
}) {
  const role =
    variant === "judge"
      ? "judge"
      : model.role === "logic" ||
          model.role === "creative" ||
          model.role === "skeptic" ||
          model.role === "explorer"
        ? model.role
        : resolveCouncilAvatarRole(model.id);

  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        variant === "judge"
          ? "border-violet-400/30 bg-violet-500/10"
          : role === "explorer"
            ? "border-fuchsia-400/30 bg-fuchsia-500/10"
            : "border-white/10 bg-white/5"
      }`}
    >
      <CouncilAvatar
        role={role}
        label={model.label}
        subtitle={model.displayName ?? model.model ?? model.deployment ?? "—"}
        mood={mood}
        compact
      />
    </div>
  );
}

export default function CouncilModelRoster({
  title,
  models,
  judge,
  mood = "idle",
}: CouncilModelRosterProps) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-300">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {models.map((model) => (
          <ModelChip key={model.id} model={model} mood={mood} />
        ))}
        {judge && <ModelChip model={judge} variant="judge" mood={mood} />}
      </div>
    </div>
  );
}
