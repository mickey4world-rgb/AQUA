"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DisneyCompanion from "@/components/disney/DisneyCompanion";
import { crowdLevelColors } from "@/lib/disney-utils";
import type { DisneyShowcaseSnapshot } from "@/lib/types/disney";

export default function DisneyShowcaseDemo() {
  const [data, setData] = useState<DisneyShowcaseSnapshot | null>(null);
  const [park, setPark] = useState<"tdl" | "tds">("tdl");

  useEffect(() => {
    fetch("/api/public/tdr-preview")
      .then(async (res) => (res.ok ? ((await res.json()) as DisneyShowcaseSnapshot) : null))
      .catch(() => null)
      .then(setData);
  }, []);

  const preview = park === "tdl" ? data?.tdl : data?.tds;
  const advice = preview?.today.characterAdvice;

  return (
    <div className="showcase-demo showcase-demo--disney">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fuchsia-300/80">
              TDR Analytics
            </p>
            <p className="mt-0.5 text-sm text-white">
              {park === "tdl" ? "東京ディズニーランド" : "東京ディズニーシー"}
            </p>
          </div>
          <div className="flex gap-1">
            {(["tdl", "tds"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPark(key)}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  park === key ? "bg-fuchsia-500/30 text-fuchsia-100" : "text-slate-400"
                }`}
              >
                {key === "tdl" ? "ランド" : "シー"}
              </button>
            ))}
          </div>
        </div>

        {!data || !preview || !advice ? (
          <p className="mt-4 text-xs text-slate-400">混雑予測を読み込み中...</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className={`rounded-lg border p-2 text-[10px] ${crowdLevelColors[preview.today.crowdLevel]}`}>
                <p className="opacity-80">本日</p>
                <p className="font-bold">{preview.today.crowdScore}</p>
              </div>
              <div className={`rounded-lg border p-2 text-[10px] ${crowdLevelColors[preview.tomorrow.crowdLevel]}`}>
                <p className="opacity-80">明日</p>
                <p className="font-bold">{preview.tomorrow.crowdScore}</p>
              </div>
            </div>

            <div className="showcase-disney-companion mt-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-2.5">
              <DisneyCompanion
                characterId={advice.characterId}
                mood="speaking"
                nameJa={advice.characterNameJa}
                line={advice.headline.slice(0, 120) + (advice.headline.length > 120 ? "…" : "")}
              />
            </div>

            <Link
              href="/tdr-preview"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/20"
            >
              カレンダー・時間帯予想をすべて見る →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
