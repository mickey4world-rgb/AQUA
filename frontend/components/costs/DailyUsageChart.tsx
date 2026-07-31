import { costsPanelClass, formatTokens, formatUsd } from "@/lib/analytics-utils";
import type { DailyUsagePoint } from "@/lib/types/analytics";

type DailyUsageChartProps = {
  points: DailyUsagePoint[];
};

export default function DailyUsageChart({ points }: DailyUsageChartProps) {
  const maxTokens = Math.max(...points.map((p) => p.totalTokens), 1);

  return (
    <div className={`${costsPanelClass} p-5`}>
      <h2 className="text-sm font-semibold text-white">日別トークン使用量</h2>
      <p className="mt-1 text-xs text-slate-400">棒グラフはトークン数、下段は API 呼び出し回数</p>

      {points.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">この月のデータはまだありません。</p>
      ) : (
        <div className="mt-6 flex items-end gap-1 overflow-x-auto pb-2">
          {points.map((point) => {
            const height = Math.max(8, (point.totalTokens / maxTokens) * 120);
            return (
              <div key={point.date} className="flex min-w-[2rem] flex-col items-center gap-2">
                <div
                  title={`${point.date}: ${point.totalTokens} tokens / ${point.apiCalls} calls`}
                  className="w-6 rounded-t-md bg-gradient-to-t from-amber-600 to-amber-300"
                  style={{ height }}
                />
                <span className="text-[10px] text-slate-500">{point.date.slice(8)}</span>
                <span className="text-[10px] text-slate-600">{point.apiCalls}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span>合計トークン: {formatTokens(points.reduce((s, p) => s + p.totalTokens, 0))}</span>
        <span>
          合計コスト: {formatUsd(points.reduce((s, p) => s + p.estimatedCostUsd, 0))}
        </span>
      </div>
    </div>
  );
}
