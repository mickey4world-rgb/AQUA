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
    <div className={`${disneyPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">リアルタイム待ち時間</h2>
        <p className="mt-1 text-xs text-slate-400">
          運営中 {operating.length} アトラクション
        </p>
      </div>

      {loading ? (
        <p className="px-4 py-6 text-sm text-slate-400">更新中...</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-white/5 overflow-y-auto">
          {operating.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white">
                  {item.nameJa ?? item.name}
                </p>
                <p className="text-xs text-slate-500">
                  {item.nameJa ? item.name : null}
                  {item.isPopular && (
                    <span className="ml-2 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-300">
                      人気
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${waitTimeColor(item.waitTime)}`}>
                  {formatWaitTime(item.waitTime)}
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatJstTime(item.lastUpdated)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
