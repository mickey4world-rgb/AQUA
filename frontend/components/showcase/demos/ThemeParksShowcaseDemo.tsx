"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DisneyCompanion from "@/components/disney/DisneyCompanion";
import { crowdLevelColors } from "@/lib/disney-utils";
import type { CrowdLevel, DisneyShowcaseSnapshot } from "@/lib/types/disney";

type ParkTab = "tdl" | "tds" | "usj";

type UsjPreviewDay = {
  date: string;
  crowdLevel: CrowdLevel;
  crowdLabel: string;
  crowdScore: number;
  characterAdvice: {
    characterNameJa: string;
    headline: string;
    crowdLevel: CrowdLevel;
    crowdScore: number;
  };
};

type UsjPreviewSnapshot = {
  park: "usj";
  parkName: string;
  today: UsjPreviewDay;
  tomorrow: UsjPreviewDay;
};

export default function ThemeParksShowcaseDemo() {
  const [tab, setTab] = useState<ParkTab>("tdl");
  const [disney, setDisney] = useState<DisneyShowcaseSnapshot | null>(null);
  const [usj, setUsj] = useState<UsjPreviewSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/public/tdr-preview")
      .then(async (res) =>
        res.ok ? ((await res.json()) as DisneyShowcaseSnapshot) : null,
      )
      .catch(() => null)
      .then(setDisney);

    fetch("/api/public/usj-preview")
      .then(async (res) =>
        res.ok ? ((await res.json()) as UsjPreviewSnapshot) : null,
      )
      .catch(() => null)
      .then(setUsj);
  }, []);

  const disneyPreview =
    tab === "tdl" ? disney?.tdl : tab === "tds" ? disney?.tds : null;
  const disneyAdvice = disneyPreview?.today.characterAdvice;
  const usjAdvice = usj?.today.characterAdvice;

  const title =
    tab === "tdl"
      ? "東京ディズニーランド"
      : tab === "tds"
        ? "東京ディズニーシー"
        : "ユニバーサル・スタジオ・ジャパン";

  const todayScore =
    tab === "usj"
      ? usj?.today.crowdScore
      : disneyPreview?.today.crowdScore;
  const tomorrowScore =
    tab === "usj"
      ? usj?.tomorrow.crowdScore
      : disneyPreview?.tomorrow.crowdScore;
  const todayLevel =
    tab === "usj"
      ? usj?.today.crowdLevel
      : disneyPreview?.today.crowdLevel;
  const tomorrowLevel =
    tab === "usj"
      ? usj?.tomorrow.crowdLevel
      : disneyPreview?.tomorrow.crowdLevel;

  const adviceName =
    tab === "usj" ? usjAdvice?.characterNameJa : disneyAdvice?.characterNameJa;
  const adviceLine =
    tab === "usj" ? usjAdvice?.headline : disneyAdvice?.headline;
  const companionId =
    tab === "usj" ? ("baymax" as const) : disneyAdvice?.characterId ?? "baymax";

  const ready =
    tab === "usj"
      ? Boolean(usj && usjAdvice)
      : Boolean(disneyPreview && disneyAdvice);

  return (
    <div className="showcase-demo showcase-demo--disney">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fuchsia-300/80">
              Theme Parks
            </p>
            <p className="mt-0.5 text-sm text-white">{title}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {(
              [
                { id: "tdl", label: "ランド" },
                { id: "tds", label: "シー" },
                { id: "usj", label: "USJ" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  tab === item.id
                    ? item.id === "usj"
                      ? "bg-red-500/30 text-red-100"
                      : "bg-fuchsia-500/30 text-fuchsia-100"
                    : "text-slate-400"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!ready || todayLevel == null || tomorrowLevel == null ? (
          <p className="mt-4 text-xs text-slate-400">混雑予測を読み込み中...</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div
                className={`rounded-lg border p-2 text-[10px] ${crowdLevelColors[todayLevel]}`}
              >
                <p className="opacity-80">本日</p>
                <p className="font-bold">{todayScore}</p>
              </div>
              <div
                className={`rounded-lg border p-2 text-[10px] ${crowdLevelColors[tomorrowLevel]}`}
              >
                <p className="opacity-80">明日</p>
                <p className="font-bold">{tomorrowScore}</p>
              </div>
            </div>

            {adviceName && adviceLine && (
              <div className="showcase-disney-companion mt-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-2.5">
                <DisneyCompanion
                  characterId={companionId}
                  mood="speaking"
                  nameJa={adviceName}
                  line={
                    adviceLine.slice(0, 120) +
                    (adviceLine.length > 120 ? "…" : "")
                  }
                />
              </div>
            )}

            <Link
              href={tab === "usj" ? "/theme-parks?tab=usj" : "/tdr-preview"}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/20"
            >
              {tab === "usj"
                ? "USJダッシュボードを見る（ログイン） →"
                : "カレンダー・時間帯予想をすべて見る →"}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
