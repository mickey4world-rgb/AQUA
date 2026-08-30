"use client";

import { useEffect, useState } from "react";
import {
  crowdBandCellStyles,
  crowdBandLabels,
  disneyPanelClass,
  formatJstDateLabel,
} from "@/lib/disney-utils";
import type { DisneyDayForecast, DisneyParkKey } from "@/lib/types/disney";

type DisneyHourlyForecastProps = {
  park: DisneyParkKey;
  date: string;
};

export default function DisneyHourlyForecast({ park, date }: DisneyHourlyForecastProps) {
  const [forecast, setForecast] = useState<DisneyDayForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const requestKey = `${park}:${date}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/disney/forecast?park=${park}&date=${date}`)
      .then(async (res) => (res.ok ? ((await res.json()) as DisneyDayForecast) : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        if (data) setForecast(data);
        setLoadedKey(`${park}:${date}`);
      });

    return () => {
      cancelled = true;
    };
  }, [park, date]);

  const isLoading = loadedKey !== requestKey;

  return (
    <div className={`${disneyPanelClass} overflow-hidden p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-300/80">
            Hourly Forecast
          </p>
          <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
            時間帯別アトラクション予想
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            {formatJstDateLabel(date)} — 過去の待ち時間記録と季節要因から予測
          </p>
        </div>
        {forecast && (
          <div className="text-right text-[11px] text-slate-400">
            <p>
              いちばん空きやすい:{" "}
              <span className="font-medium text-emerald-300">
                {forecast.summary.quietestLabel}
              </span>
            </p>
            <p>
              いちばん混みやすい:{" "}
              <span className="font-medium text-rose-300">
                {forecast.summary.busiestLabel}
              </span>
            </p>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-400">予想図を読み込み中...</p>
      ) : forecast ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[640px] w-full border-separate border-spacing-1 text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-indigo-950/95 px-2 py-1 text-left font-medium text-slate-400">
                    アトラクション
                  </th>
                  {forecast.hourLabels.map((label) => (
                    <th key={label} className="px-1 py-1 font-medium text-slate-500">
                      {label.replace(":00", "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecast.attractions.map((attr) => (
                  <tr key={attr.id}>
                    <td className="sticky left-0 z-10 bg-indigo-950/95 px-2 py-1 text-left text-[11px] text-slate-200">
                      {attr.nameJa}
                    </td>
                    {attr.slots.map((slot) => (
                      <td
                        key={`${attr.id}-${slot.hour}`}
                        title={`${slot.label} — 約${slot.waitMinutes}分`}
                        className={`rounded px-1 py-1 text-center font-mono font-semibold ${crowdBandCellStyles[slot.band]}`}
                      >
                        {slot.waitMinutes}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(["empty", "moderate", "busy", "extreme"] as const).map((band) => (
              <span
                key={band}
                className={`rounded px-2 py-0.5 text-[10px] ${crowdBandCellStyles[band]}`}
              >
                {crowdBandLabels[band]}
              </span>
            ))}
            <span className="text-[10px] text-slate-500">セル数字 = 予想待ち時間（分）</span>
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-rose-300">予想図を取得できませんでした。</p>
      )}
    </div>
  );
}
