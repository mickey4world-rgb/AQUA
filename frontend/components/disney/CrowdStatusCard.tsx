"use client";

import { crowdLevelColors, disneyPanelClass, formatJstTime } from "@/lib/disney-utils";
import type { ParkCrowdStatus } from "@/lib/types/disney";

type CrowdStatusCardProps = {
  status: ParkCrowdStatus;
  predictionLabel?: string;
  predictionDescription?: string;
  mode?: "live" | "forecast";
  targetDate?: string;
};

export default function CrowdStatusCard({
  status,
  predictionLabel,
  predictionDescription,
  mode = "live",
  targetDate,
}: CrowdStatusCardProps) {
  const isForecast = mode === "forecast";

  return (
    <div className={`${disneyPanelClass} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-300/80">
            {isForecast ? "Forecast" : "Live Crowd"}
          </p>
          <h3 className="mt-1 text-xl font-bold text-white">{status.parkName}</h3>
          {targetDate && (
            <p className="mt-1 text-xs text-slate-400">
              {isForecast ? "予測日" : "表示日"}: {targetDate}
            </p>
          )}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${crowdLevelColors[status.crowdLevel]}`}
        >
          {status.crowdLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">{isForecast ? "予測平均待ち" : "平均待ち"}</dt>
          <dd className="font-semibold text-white">
            {isForecast ? `約${status.averageWait}分` : `${status.averageWait}分`}
          </dd>
        </div>
        {!isForecast && (
          <>
            <div>
              <dt className="text-slate-500">中央値</dt>
              <dd className="font-semibold text-white">{status.medianWait}分</dd>
            </div>
            <div>
              <dt className="text-slate-500">45分超</dt>
              <dd className="font-semibold text-white">{status.highWaitCount}件</dd>
            </div>
            <div>
              <dt className="text-slate-500">75分超</dt>
              <dd className="font-semibold text-white">{status.extremeWaitCount}件</dd>
            </div>
          </>
        )}
      </dl>

      {!isForecast && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>{status.isOpen ? "営業中" : "閉園中"}</span>
          {status.openingTime && <span>開園 {formatJstTime(status.openingTime)}</span>}
          {status.closingTime && <span>閉園 {formatJstTime(status.closingTime)}</span>}
          <span>更新 {formatJstTime(status.fetchedAt)}</span>
        </div>
      )}

      {predictionLabel && (
        <div className="mt-4 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-3">
          <p className="text-sm font-semibold text-fuchsia-200">
            {isForecast ? "混雑予測" : "本日の混雑予測"}: {predictionLabel}
          </p>
          {predictionDescription && (
            <p className="mt-1 text-sm text-slate-300">{predictionDescription}</p>
          )}
        </div>
      )}
    </div>
  );
}
