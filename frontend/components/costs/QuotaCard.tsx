import { costsPanelClass, formatPercent, formatTokens, formatUsd } from "@/lib/analytics-utils";
import type { QuotaSummary } from "@/lib/types/analytics";

type QuotaCardProps = {
  quota: QuotaSummary;
  monthLabel: string;
};

export default function QuotaCard({ quota, monthLabel }: QuotaCardProps) {
  const barWidth = Math.min(100, quota.percentUsed);

  return (
    <div className={`${costsPanelClass} p-6`}>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/80">
        Monthly Quota
      </p>
      <h2 className="mt-2 text-xl font-bold text-white">{monthLabel} の AI 利用状況</h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">使用トークン</p>
          <p className="mt-1 text-2xl font-bold text-white">{formatTokens(quota.used)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">残り</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {formatTokens(quota.remaining)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">推定コスト</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">
            {formatUsd(quota.estimatedCostUsd)}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-400">
            上限 {formatTokens(quota.limit)} トークン
          </span>
          <span className="font-medium text-white">{formatPercent(quota.percentUsed)}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${
              quota.percentUsed >= 90
                ? "bg-rose-500"
                : quota.percentUsed >= 70
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
}
