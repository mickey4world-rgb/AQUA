"use client";

import type { DisneyCharacterId } from "@/lib/disney-characters";

export type DisneyMood = "idle" | "thinking" | "speaking";

type DisneyCompanionProps = {
  characterId: DisneyCharacterId;
  mood: DisneyMood;
  line: string;
  nameJa: string;
};

const THEMES: Record<
  DisneyCharacterId,
  {
    core: string;
    glow: string;
    orbs: string[];
    ring: string;
    label: string;
  }
> = {
  mickey: {
    core: "radial-gradient(circle at 35% 30%, #fff7ed, #fb7185 42%, #f59e0b 88%)",
    glow: "rgba(251, 113, 133, 0.7)",
    orbs: ["#fbbf24", "#fb7185", "#fdba74", "#fef08a"],
    ring: "rgba(251, 191, 36, 0.45)",
    label: "Mickey Light",
  },
  donald: {
    core: "radial-gradient(circle at 35% 30%, #eff6ff, #38bdf8 40%, #2563eb 88%)",
    glow: "rgba(56, 189, 248, 0.75)",
    orbs: ["#93c5fd", "#fbbf24", "#60a5fa", "#ffffff"],
    ring: "rgba(96, 165, 250, 0.5)",
    label: "Donald Spark",
  },
  elsa: {
    core: "radial-gradient(circle at 35% 30%, #f8fafc, #a5f3fc 38%, #67e8f9 70%, #818cf8 95%)",
    glow: "rgba(165, 243, 252, 0.75)",
    orbs: ["#e0f2fe", "#a5f3fc", "#c4b5fd", "#f0f9ff"],
    ring: "rgba(186, 230, 253, 0.55)",
    label: "Elsa Aura",
  },
  baymax: {
    core: "radial-gradient(circle at 35% 30%, #ffffff, #fecaca 48%, #f87171 92%)",
    glow: "rgba(248, 113, 113, 0.55)",
    orbs: ["#fecaca", "#ffffff", "#fda4af", "#fee2e2"],
    ring: "rgba(254, 202, 202, 0.55)",
    label: "Baymax Pulse",
  },
};

const ORBIT_RS = [24, 32, 20, 36];

export default function DisneyCompanion({
  characterId,
  mood,
  line,
  nameJa,
}: DisneyCompanionProps) {
  const theme = THEMES[characterId];

  return (
    <div className="flex items-center gap-4">
      <div
        className="disney-companion"
        data-mood={mood}
        data-character={characterId}
        aria-hidden
      >
        <span
          className="disney-companion__ring"
          style={{ borderColor: theme.ring }}
        />
        <span
          className="disney-companion__ring"
          style={{ borderColor: theme.ring, animationDelay: "0.85s" }}
        />
        <span
          className="disney-companion__core"
          style={{
            background: theme.core,
            boxShadow: `0 0 18px ${theme.glow}, 0 0 42px ${theme.glow}`,
          }}
        />
        {theme.orbs.map((color, index) => (
          <span
            key={index}
            className="disney-companion__orb"
            style={{
              ["--orbit-r" as string]: `${ORBIT_RS[index % ORBIT_RS.length]}px`,
              ["--orbit-dur" as string]: `${5.5 + index * 1.4}s`,
              animationDelay: `${-index * 0.7}s`,
              background: color,
              boxShadow: `0 0 10px ${color}`,
            }}
          />
        ))}
        <span className="disney-companion__ears" data-character={characterId} />
      </div>

      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.18em] text-fuchsia-200/70 uppercase">
          {theme.label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">
          <span className="text-fuchsia-100/90">{nameJa}</span>
          {" — "}
          {line}
        </p>
      </div>
    </div>
  );
}
