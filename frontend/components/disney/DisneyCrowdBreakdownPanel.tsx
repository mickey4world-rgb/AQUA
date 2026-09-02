"use client";

import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyCrowdBreakdown } from "@/lib/types/disney";

const BREAKDOWN_ITEMS: Array<{
  key: keyof Omit<DisneyCrowdBreakdown, "total" | "labels">;
  label: string;
}> = [
  { key: "calendar", label: "曜日・祝日" },
  { key: "seasonal", label: "季節・長休み" },
  { key: "schoolK12", label: "小中高・休み" },
  { key: "universityBreak", label: "大学・休み" },
  { key: "weather", label: "天候影響" },
  { key: "event", label: "TDRイベント" },
  { key: "regionalPassport", label: "地域限定パス" },
  { key: "otherThemeParks", label: "他テーマパーク" },
  { key: "metroEvents", label: "都内イベント" },
  { key: "newsBuzz", label: "世間の注目" },
  { key: "merchandise", label: "グッズ販売" },
  { key: "historical", label: "過去傾向" },
  { key: "disasterImpact", label: "災害・荒天" },
];

type DisneyCrowdBreakdownPanelProps = {
  breakdown: DisneyCrowdBreakdown | null;
  crowdLabel?: string;
  title?: string;
};

export default function DisneyCrowdBreakdownPanel({
  breakdown,
  crowdLabel,
  title = "混雑スコア内訳",
}: DisneyCrowdBreakdownPanelProps) {
  if (!breakdown) return null;

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
        Crowd Score
      </p>
      <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
        {title}
        {crowdLabel ? (
          <span className="ml-2 text-sm font-normal text-slate-300">({crowdLabel})</span>
        ) : null}
      </h2>
      <p className="mt-1 text-3xl font-bold text-white">
        {breakdown.total}
        <span className="ml-1 text-sm font-normal text-slate-400">/ 100</span>
      </p>

      <div className="mt-4 space-y-3">
        {BREAKDOWN_ITEMS.map(({ key, label }) => {
          const score = breakdown[key];
          const detail = breakdown.labels[key];
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-300">
                  {label}
                  <span className="ml-1 text-slate-500">({detail})</span>
                </span>
                <span className="font-mono text-cyan-200">{score}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
