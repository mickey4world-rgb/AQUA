"use client";

export type ConsultMood = "idle" | "thinking" | "speaking";

type ConsultCompanionProps = {
  mood: ConsultMood;
  line: string;
};

const ORBS = [
  { r: 26, dur: "6.5s", delay: "0s", color: "#67e8f9" },
  { r: 34, dur: "9s", delay: "-2s", color: "#a5b4fc" },
  { r: 22, dur: "5.2s", delay: "-1.2s", color: "#5eead4" },
  { r: 38, dur: "11s", delay: "-4s", color: "#bae6fd" },
  { r: 30, dur: "7.4s", delay: "-3s", color: "#99f6e4" },
];

const SPARKS = [
  { top: "8%", left: "62%", dur: "4.2s", delay: "0s" },
  { top: "70%", left: "18%", dur: "5.1s", delay: "-1s" },
  { top: "22%", left: "12%", dur: "3.8s", delay: "-0.6s" },
  { top: "78%", left: "72%", dur: "4.7s", delay: "-1.8s" },
];

export default function ConsultCompanion({ mood, line }: ConsultCompanionProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="consult-companion" data-mood={mood} aria-hidden>
        <span className="consult-companion__ring" />
        <span className="consult-companion__ring" style={{ animationDelay: "0.9s" }} />
        <span className="consult-companion__core" />

        {ORBS.map((orb, index) => (
          <span
            key={index}
            className="consult-companion__orb"
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
            className="consult-companion__spark"
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
        <p className="text-[11px] font-medium tracking-[0.18em] text-cyan-200/70 uppercase">
          Companion
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{line}</p>
      </div>
    </div>
  );
}
