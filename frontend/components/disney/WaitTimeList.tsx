"use client";

import {
  disneyPanelClass,
  formatJstTime,
  formatWaitTime,
  waitTimeColor,
} from "@/lib/disney-utils";
import type { AttractionWait } from "@/lib/types/disney";

type WaitTimeListProps = {
  attractions: AttractionWait[];
  loading?: boolean;
  mode?: "live" | "forecast";
  targetDate?: string;
};

export default function WaitTimeList({
  attractions,
  loading,
  mode = "live",
  targetDate,
}: WaitTimeListProps) {
  if (mode === "forecast") {
    return (
      <div className={`${disneyPanelClass} p-5`}>
        <h2 className="text-sm font-semibold text-white">リアルタイム待ち時間</h2>
        <p className="mt-3 text-sm text-slate-400">
          {targetDate
            ? `${targetDate} は未来日のため、リアルタイム待ち時間は表示されません。`
            : "予測モードのため、リアルタイム待ち時間は表示されません。"}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          カレンダー予測と AI ガイドを参考に来園計画を立ててください。当日は自動的にライブデータに切り替わります。
        </p>
      </div>
    );
  }

  const operating = attractions.filter((item) => item.status === "OPERATING");

  return (
    <div className={`${disneyPanelClass} overflow-visible`}>
      <div className="border-b border-white/10 px-3 py-3 sm:px-4">
        <h2 className="text-sm font-semibold text-white">リアルタイム待ち時間</h2>
        <p className="mt-1 text-xs text-slate-400">
          運営中 {operating.length} アトラクション
        </p>
      </div>

      {loading ? (
        <p className="px-3 py-6 text-sm text-slate-400 sm:px-4">更新中...</p>
      ) : (
        <ul className="max-h-[min(28rem,55dvh)] divide-y divide-white/5 overflow-y-auto overscroll-contain sm:max-h-[32rem]">
          {operating.map((item) => (
            <li key={item.id} className="px-3 py-3 sm:px-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {item.nameJa ?? item.name}
                  </p>
                  {(item.nameJa && item.name !== item.nameJa) || item.isPopular ? (
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                      {item.nameJa && item.name !== item.nameJa ? (
                        <p className="truncate text-xs text-slate-500">{item.name}</p>
                      ) : null}
                      {item.isPopular && (
                        <span className="shrink-0 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-300">
                          人気
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="min-w-[4.5rem] text-right">
                  <p
                    className={`text-lg font-bold leading-tight tabular-nums sm:text-xl ${waitTimeColor(item.waitTime)}`}
                  >
                    {formatWaitTime(item.waitTime)}
                  </p>
                  <p className="text-[10px] leading-tight text-slate-500">
                    {formatJstTime(item.lastUpdated)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
