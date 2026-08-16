"use client";

import { useEffect, useState } from "react";
import SolunaCharacterAvatar from "@/components/soluna/SolunaCharacterAvatar";
import {
  SHOWCASE_SOLUNA_SCENARIOS,
  type ShowcaseSolunaScenario,
} from "@/lib/showcase-data";
import { SOLUNA_LUNA_STAGES, SOLUNA_SOL_STAGES } from "@/lib/types/soluna";

function tierLabel(level: 1 | 2 | 3): string {
  return `知能 Lv.${level}`;
}

export default function SolunaShowcaseDemo() {
  const [active, setActive] = useState(0);
  const scenario: ShowcaseSolunaScenario = SHOWCASE_SOLUNA_SCENARIOS[active];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((prev) => (prev + 1) % SHOWCASE_SOLUNA_SCENARIOS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const solStage = SOLUNA_SOL_STAGES[Math.min(scenario.solStageIndex, SOLUNA_SOL_STAGES.length - 1)];
  const lunaStage = SOLUNA_LUNA_STAGES[Math.min(scenario.lunaStageIndex, SOLUNA_LUNA_STAGES.length - 1)];

  return (
    <div className="showcase-demo showcase-demo--soluna">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/80">
          Soluna — Dual Companion
        </p>

        <div className="showcase-soluna-framework mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-slate-300">
          <span className="text-cyan-200/90">Framework:</span>{" "}
          ソル・ルーナの<strong className="font-medium text-white">性格と Cosmos 記憶</strong>
          は固定。問い合わせ内容・親密度・コスト状況に応じて、
          <strong className="font-medium text-white"> OpenAI / Claude / Gemini </strong>
          の最新利用可能モデルを自動選択。
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">User</p>
          <p className="showcase-typewriter mt-1 text-sm text-white">{scenario.question}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div
            className={`showcase-soluna-card rounded-2xl border px-3 py-3 transition-all duration-500 ${
              scenario.solSpeaking
                ? "border-amber-300/30 bg-amber-400/10 scale-[1.02]"
                : "border-amber-300/15 bg-amber-400/[0.05] opacity-85"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <SolunaCharacterAvatar
                character="sol"
                stage={solStage}
                mood={scenario.solSpeaking ? "speaking" : "idle"}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-100/80">
                  ソル · {solStage.label} · {tierLabel(scenario.solTierLevel)}
                </p>
                <p className="mt-1 text-[10px] text-amber-200/70">{scenario.solModelLabel}</p>
                <p className="mt-2 text-xs leading-relaxed text-amber-50/95">{scenario.solReply}</p>
              </div>
            </div>
          </div>

          <div
            className={`showcase-soluna-card rounded-2xl border px-3 py-3 transition-all duration-500 ${
              scenario.lunaSpeaking
                ? "border-indigo-300/30 bg-indigo-400/10 scale-[1.02]"
                : "border-indigo-300/15 bg-indigo-400/[0.05] opacity-85"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <SolunaCharacterAvatar
                character="luna"
                stage={lunaStage}
                mood={scenario.lunaSpeaking ? "speaking" : "idle"}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-indigo-100/80">
                  ルーナ · {lunaStage.label} · {tierLabel(scenario.lunaTierLevel)}
                </p>
                <p className="mt-1 text-[10px] text-indigo-200/70">{scenario.lunaModelLabel}</p>
                <p className="mt-2 text-xs leading-relaxed text-indigo-50/95">{scenario.lunaReply}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {scenario.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
