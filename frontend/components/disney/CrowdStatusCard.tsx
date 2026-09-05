"use client";

import { crowdLevelColors, disneyPanelClass, formatJstTime } from "@/lib/disney-utils";
import type { ParkCrowdStatus } from "@/lib/types/disney";

type CrowdStatusCardProps = {
  status: ParkCrowdStatus;
  predictionLabel?: string;
  predictionDescription?: string;
  mode?: "live" | "forecast";
  targetDate?: string;
  /** 予想時の Crowd Score（過去・未来の予測モード向け） */
  crowdScore?: number;
  /** 過去日はリアルタイム表示を出さない */
  hideRealtime?: boolean;
};

export default function CrowdStatusCard({
  status,
  predictionLabel,
  predictionDescription,
  mode = "live",
  targetDate,
  crowdScore,
  hideRealtime = false,
}: CrowdStatusCardProps) {
  const isForecast = mode === "forecast" || hideRealtime;

  return (
    <div className={`${disneyPanelClass} p-5`}>
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-300/80">
            {isForecast ? "Forecast" : "Live Crowd"}
          </p>
          <h3 className="mt-1 truncate text-lg font-bold text-white sm:text-xl">
            {status.parkName}
          </h3>
          {targetDate && (
            <p className="mt-1 text-xs text-slate-400">
              {isForecast ? "予測日" : "表示日"}: {targetDate}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold sm:px-3 sm:text-sm ${crowdLevelColors[status.crowdLevel]}`}
        >
          {status.crowdLabel}
        </span>
      </div>

      {typeof crowdScore === "number" && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
            Crowd Score（予想時）
          </p>
          <p className="mt-0.5 text-2xl font-bold text-white">
            {crowdScore}
            <span className="ml-1 text-sm font-normal text-slate-400">/ 100</span>
          </p>
        </div>
      )}

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
