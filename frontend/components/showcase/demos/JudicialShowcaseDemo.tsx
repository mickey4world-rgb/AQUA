"use client";

import { useEffect, useMemo, useState } from "react";
import JudicialCompanion, {
  type JudicialMood,
} from "@/components/works/judicial/JudicialCompanion";
import {
  SHOWCASE_JUDICIAL_AI,
  SHOWCASE_JUDICIAL_DOCS,
  type ShowcaseJudicialPhase,
} from "@/lib/showcase-data";

type DemoStage = "reading" | "thinking" | "result";

const PHASE_ORDER: ShowcaseJudicialPhase[] = ["issues", "timeline", "evidence"];

export default function JudicialShowcaseDemo() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [stage, setStage] = useState<DemoStage>("reading");
  const [thinkingStep, setThinkingStep] = useState(0);
  const [revealedItems, setRevealedItems] = useState(0);

  const phase = SHOWCASE_JUDICIAL_AI.phases[phaseIndex];
  const analyzedCount =
    stage === "reading" ? Math.min(phaseIndex + 2, SHOWCASE_JUDICIAL_DOCS.length) : SHOWCASE_JUDICIAL_DOCS.length;

  useEffect(() => {
    setStage("reading");
    setThinkingStep(0);
    setRevealedItems(0);

    const readTimer = window.setTimeout(() => setStage("thinking"), 1400);
    return () => window.clearTimeout(readTimer);
  }, [phaseIndex]);

  useEffect(() => {
    if (stage !== "thinking") return;

    const steps = phase.thinking.length;
    const stepTimer = window.setInterval(() => {
      setThinkingStep((prev) => {
        if (prev >= steps - 1) {
          window.clearInterval(stepTimer);
          window.setTimeout(() => setStage("result"), 500);
          return prev;
        }
        return prev + 1;
      });
    }, 900);

    return () => window.clearInterval(stepTimer);
  }, [stage, phase.thinking.length]);

  useEffect(() => {
    if (stage !== "result") return;

    setRevealedItems(0);
    const itemCount =
      phase.id === "timeline"
        ? phase.items.length
        : phase.id === "evidence"
          ? phase.items.length
          : phase.items.length;

    const revealTimer = window.setInterval(() => {
      setRevealedItems((prev) => {
        if (prev >= itemCount - 1) {
          window.clearInterval(revealTimer);
          window.setTimeout(
            () => setPhaseIndex((i) => (i + 1) % SHOWCASE_JUDICIAL_AI.phases.length),
            4200,
          );
          return prev;
        }
        return prev + 1;
      });
    }, 650);

    return () => window.clearInterval(revealTimer);
  }, [stage, phase]);

  const statusLine = useMemo(() => {
    if (stage === "reading") {
      return `${SHOWCASE_JUDICIAL_AI.provider} が資料を読み込み中… (${analyzedCount}/${SHOWCASE_JUDICIAL_DOCS.length})`;
    }
    if (stage === "thinking") {
      return phase.thinking[thinkingStep] ?? "整理中…";
    }
    return phase.summary;
  }, [stage, thinkingStep, phase, analyzedCount]);

  const companionMood: JudicialMood =
    stage === "reading" ? "idle" : stage === "thinking" ? "thinking" : "speaking";

  return (
    <div className="showcase-demo showcase-demo--judicial">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-3">
          <JudicialCompanion mood={companionMood} line={statusLine} label="AI Analyst" />
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/80">
              訴訟記録分析
            </p>
            <p className="mt-0.5 text-sm text-white">{SHOWCASE_JUDICIAL_AI.caseTitle}</p>
          </div>
          <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] text-violet-100">
            {SHOWCASE_JUDICIAL_AI.provider} AI
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SHOWCASE_JUDICIAL_AI.phases.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-full px-2.5 py-1 text-[10px] transition ${
                index === phaseIndex
                  ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/30"
                  : index < phaseIndex || stage === "result"
                    ? "bg-emerald-500/10 text-emerald-200"
                    : "bg-white/5 text-slate-500"
              }`}
            >
              {item.label}
              {(index < phaseIndex || (index === phaseIndex && stage === "result")) && " ✓"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">資料ライブラリ</p>
            <ul className="mt-2 space-y-1.5">
              {SHOWCASE_JUDICIAL_DOCS.map((doc, index) => {
                const read = index < analyzedCount;
                return (
                  <li
                    key={doc.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      read
                        ? "border-violet-400/20 bg-violet-500/10 text-slate-200"
                        : "border-white/8 bg-white/[0.02] text-slate-500"
                    }`}
                  >
                    <span className="font-medium">{doc.label}</span>
                    <span className="text-[10px] text-slate-400">
                      {read ? "✓ 分析済" : doc.tag}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">
              AI 整理 — {phase.label}
            </p>
            <p className="showcase-judicial-status mt-2 text-xs text-slate-300">{statusLine}</p>
            <p className="mt-1 text-[10px] text-slate-500">プロンプト: {phase.prompt}</p>

            <div className="mt-3 min-h-[11rem] space-y-2">
              {stage === "result" && phase.id === "issues" &&
                phase.items.slice(0, revealedItems + 1).map((item) => (
                  <div
                    key={item.title}
                    className="showcase-judicial-result rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white">{item.title}</p>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-violet-200">
                        {item.stance}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{item.body}</p>
                    <p className="mt-1.5 text-[10px] text-slate-500">
                      根拠: {item.refs.join(" · ")}
                    </p>
                  </div>
                ))}

              {stage === "result" && phase.id === "timeline" &&
                phase.items.slice(0, revealedItems + 1).map((item) => (
                  <div
                    key={item.date}
                    className="showcase-judicial-result flex gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <p className="shrink-0 font-mono text-[10px] text-cyan-300">{item.date}</p>
                    <div>
                      <p className="text-xs text-slate-200">{item.event}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{item.refs.join(" · ")}</p>
                    </div>
                  </div>
                ))}

              {stage === "result" && phase.id === "evidence" &&
                phase.items.slice(0, revealedItems + 1).map((item) => (
                  <div
                    key={item.exhibit}
                    className="showcase-judicial-result rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">{item.exhibit}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          item.status === "争いあり"
                            ? "bg-amber-500/15 text-amber-200"
                            : item.status === "反証資料"
                              ? "bg-sky-500/15 text-sky-200"
                              : "bg-emerald-500/15 text-emerald-200"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-400">
                      立証: {item.claim} / 反証: {item.counter}
                    </p>
                  </div>
                ))}

              {stage !== "result" && (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-slate-500">
                  {stage === "reading" ? "資料を横断参照中…" : "AI が構造化出力を生成中…"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
