"use client";

import { useEffect, useState } from "react";
import CouncilAvatar from "@/components/council/CouncilAvatar";
import { SHOWCASE_COUNCIL_LINES } from "@/lib/showcase-data";

export default function CouncilShowcaseDemo() {
  const [active, setActive] = useState(0);
  const line = SHOWCASE_COUNCIL_LINES[active];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % SHOWCASE_COUNCIL_LINES.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="showcase-demo showcase-demo--council">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/80">
          AI Council — Round 2
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SHOWCASE_COUNCIL_LINES.slice(0, 3).map((member, index) => (
            <div
              key={member.role}
              className={`rounded-xl border p-2 transition-all duration-500 ${
                active === index
                  ? "border-white/20 bg-white/10 scale-105"
                  : "border-white/8 bg-white/[0.03] opacity-70"
              }`}
            >
              <CouncilAvatar
                role={member.role}
                label={member.label}
                mood={active === index ? "speaking" : "idle"}
                compact
              />
            </div>
          ))}
          <div
            className={`rounded-xl border p-2 transition-all duration-500 ${
              active === 3
                ? "border-violet-400/35 bg-violet-500/10 scale-105"
                : "border-white/8 bg-white/[0.03] opacity-70"
            }`}
          >
            <CouncilAvatar
              role="judge"
              label="議長"
              mood={active === 3 ? "speaking" : "thinking"}
              compact
            />
          </div>
        </div>

        <div className="showcase-council-bubble mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-medium text-slate-400">{line.label}</p>
          <p className="showcase-typewriter mt-2 text-sm leading-relaxed text-slate-100">
            {line.text}
          </p>
        </div>
      </div>
    </div>
  );
}
