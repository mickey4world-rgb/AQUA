"use client";

export type JudicialMood = "idle" | "thinking" | "speaking";

type JudicialCompanionProps = {
  mood: JudicialMood;
  line: string;
};

const ORBS = [
  { r: 26, dur: "6.8s", delay: "0s", color: "#c4b5fd" },
  { r: 34, dur: "9.2s", delay: "-2s", color: "#f0abfc" },
  { r: 22, dur: "5.4s", delay: "-1.1s", color: "#a78bfa" },
  { r: 38, dur: "11.4s", delay: "-4s", color: "#e9d5ff" },
  { r: 30, dur: "7.6s", delay: "-3s", color: "#ddd6fe" },
];

const SPARKS = [
  { top: "10%", left: "64%", dur: "4.3s", delay: "0s" },
  { top: "68%", left: "16%", dur: "5.2s", delay: "-1s" },
  { top: "24%", left: "14%", dur: "3.9s", delay: "-0.7s" },
  { top: "76%", left: "74%", dur: "4.8s", delay: "-1.7s" },
];

export default function JudicialCompanion({ mood, line }: JudicialCompanionProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="judicial-companion" data-mood={mood} aria-hidden>
        <span className="judicial-companion__ring" />
        <span className="judicial-companion__ring" style={{ animationDelay: "0.9s" }} />
        <span className="judicial-companion__core" />

        {ORBS.map((orb, index) => (
          <span
            key={index}
            className="judicial-companion__orb"
            style={{
              ["--orbit-r" as string]: `${orb.r}px`,
              ["--orbit-dur" as string]: orb.dur,
              animationDelay: orb.delay,
              background: orb.color,
              boxShadow: `0 0 10px ${orb.color}`,
            }}
          />
        ))}

        {SPARKS.map((spark, index) => (
          <span
            key={`spark-${index}`}
            className="judicial-companion__spark"
            style={{
              top: spark.top,
              left: spark.left,
              ["--drift-dur" as string]: spark.dur,
              animationDelay: spark.delay,
            }}
          />
        ))}
      </div>

      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.18em] text-violet-200/70 uppercase">
          Clerk
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{line}</p>
      </div>
    </div>
  );
}
