"use client";

export type CouncilAvatarMood = "idle" | "thinking" | "speaking";
export type CouncilAvatarRole =
  | "logic"
  | "creative"
  | "skeptic"
  | "explorer"
  | "judge";

type CouncilAvatarProps = {
  role: CouncilAvatarRole;
  label: string;
  subtitle?: string;
  mood?: CouncilAvatarMood;
  compact?: boolean;
};

const ROLE_THEME: Record<
  CouncilAvatarRole,
  { core: string; glow: string; orbs: string[]; tag: string }
> = {
  logic: {
    core: "radial-gradient(circle at 35% 30%, #ecfdf5, #34d399 45%, #059669 90%)",
    glow: "rgba(52, 211, 153, 0.7)",
    orbs: ["#6ee7b7", "#a7f3d0", "#34d399"],
    tag: "Logic",
  },
  creative: {
    core: "radial-gradient(circle at 35% 30%, #eff6ff, #38bdf8 45%, #0284c7 90%)",
    glow: "rgba(56, 189, 248, 0.7)",
    orbs: ["#7dd3fc", "#bae6fd", "#38bdf8"],
    tag: "Idea",
  },
  skeptic: {
    core: "radial-gradient(circle at 35% 30%, #fffbeb, #fbbf24 45%, #d97706 90%)",
    glow: "rgba(251, 191, 36, 0.7)",
    orbs: ["#fde68a", "#fcd34d", "#f59e0b"],
    tag: "Probe",
  },
  explorer: {
    core: "radial-gradient(circle at 35% 30%, #eef2ff, #a78bfa 40%, #22d3ee 88%)",
    glow: "rgba(167, 139, 250, 0.75)",
    orbs: ["#c4b5fd", "#67e8f9", "#a5b4fc", "#f0abfc"],
    tag: "Gemini",
  },
  judge: {
    core: "radial-gradient(circle at 35% 30%, #f5f3ff, #a78bfa 42%, #7c3aed 90%)",
    glow: "rgba(167, 139, 250, 0.75)",
    orbs: ["#c4b5fd", "#ddd6fe", "#a78bfa"],
    tag: "Chair",
  },
};

export function resolveCouncilAvatarRole(
  modelId: string,
  fallback: CouncilAvatarRole = "logic",
): CouncilAvatarRole {
  if (modelId.includes("gemini") || modelId.includes("explorer")) return "explorer";
  if (modelId.includes("judge")) return "judge";
  if (modelId.includes("creative") || modelId.includes("global-b")) return "creative";
  if (modelId.includes("skeptic") || modelId.includes("global-c")) return "skeptic";
  if (modelId.includes("logic") || modelId.includes("global-a")) return "logic";
  return fallback;
}

export default function CouncilAvatar({
  role,
  label,
  subtitle,
  mood = "idle",
  compact = false,
}: CouncilAvatarProps) {
  const theme = ROLE_THEME[role];

  return (
    <div className={`flex items-center gap-3 ${compact ? "" : ""}`}>
      <div
        className={`council-avatar ${compact ? "council-avatar--compact" : ""}`}
        data-mood={mood}
        data-role={role}
        aria-hidden
      >
        <span className="council-avatar__ring" style={{ borderColor: theme.glow }} />
        <span
          className="council-avatar__core"
          style={{
            background: theme.core,
            boxShadow: `0 0 14px ${theme.glow}, 0 0 28px ${theme.glow}`,
          }}
        />
        {theme.orbs.map((color, index) => (
          <span
            key={index}
            className="council-avatar__orb"
            style={{
              ["--orbit-r" as string]: compact ? `${14 + index * 4}px` : `${18 + index * 5}px`,
              ["--orbit-dur" as string]: `${4.8 + index * 1.1}s`,
              animationDelay: `${-index * 0.55}s`,
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          {theme.tag}
        </p>
        <p className={`truncate font-medium text-white ${compact ? "text-xs" : "text-sm"}`}>
          {label}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
