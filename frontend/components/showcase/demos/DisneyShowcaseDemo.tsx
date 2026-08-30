"use client";

import { useEffect, useState } from "react";
import DisneyCompanion from "@/components/disney/DisneyCompanion";
import { crowdBandCellStyles, crowdLevelColors } from "@/lib/disney-utils";
import type { DisneyShowcaseSnapshot } from "@/lib/types/disney";

export default function DisneyShowcaseDemo() {
  const [data, setData] = useState<DisneyShowcaseSnapshot | null>(null);
  const [park, setPark] = useState<"tdl" | "tds">("tdl");

  useEffect(() => {
    fetch("/api/disney/showcase")
      .then(async (res) => (res.ok ? ((await res.json()) as DisneyShowcaseSnapshot) : null))
      .catch(() => null)
      .then(setData);
  }, []);

  const snapshot = park === "tdl" ? data?.tdl : data?.tds;
  const advice = snapshot?.eveningAdvice;
  const forecast = snapshot?.todayForecast;
  const calendar = snapshot?.calendar?.slice(0, 7) ?? [];

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
                  park === key
                    ? "bg-fuchsia-500/30 text-fuchsia-100"
                    : "text-slate-400"
                }`}
              >
                {key === "tdl" ? "ランド" : "シー"}
              </button>
            ))}
          </div>
        </div>

        {!data ? (
          <p className="mt-4 text-xs text-slate-400">混雑予測を読み込み中...</p>
        ) : advice ? (
          <>
            <div className="showcase-disney-companion mt-4 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-2.5">
              <DisneyCompanion
                characterId={advice.characterId}
                mood="speaking"
                nameJa={advice.characterNameJa}
                line={advice.headline}
              />
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1">
              {calendar.map((day) => (
                <div
                  key={day.date}
                  className={`rounded border px-1 py-1 text-center text-[9px] ${
                    crowdLevelColors[day.crowdLevel]
                  }`}
                  title={day.crowdLabel}
                >
                  <div className="font-bold">{Number(day.date.slice(8, 10))}</div>
                  <div className="font-mono">{day.crowdScore}</div>
                </div>
              ))}
            </div>

            {forecast && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-[9px]">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left">Attr</th>
                      {forecast.hourLabels.slice(0, 6).map((h) => (
                        <th key={h}>{h.replace(":00", "")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.attractions.slice(0, 4).map((attr) => (
                      <tr key={attr.id}>
                        <td className="text-slate-300">{attr.nameJa.slice(0, 6)}</td>
                        {attr.slots.slice(0, 6).map((slot) => (
                          <td
                            key={slot.hour}
                            className={`text-center font-mono ${crowdBandCellStyles[slot.band]}`}
                          >
                            {slot.waitMinutes}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-2 text-[10px] text-slate-500">
              公開プレビュー · ルールベース予測（AI コストなし）· 明日{" "}
              {data.tomorrow} 向け
            </p>
          </>
        ) : (
          <p className="mt-4 text-xs text-rose-300">データを取得できませんでした</p>
        )}
      </div>
    </div>
  );
}
