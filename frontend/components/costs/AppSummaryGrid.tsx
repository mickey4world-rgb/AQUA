import { appAccentStyles, costsPanelClass, formatDuration, formatTokens, formatUsd } from "@/lib/analytics-utils";
import type { AppUsageSummary } from "@/lib/types/analytics";

type AppSummaryGridProps = {
  apps: AppUsageSummary[];
};

export default function AppSummaryGrid({ apps }: AppSummaryGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {apps.map((app) => {
        const accent = appAccentStyles[app.app];
        return (
          <div
            key={app.app}
            className={`${costsPanelClass} border ${accent.border} p-5`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wider ${accent.text}`}>
              {app.label}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">API 呼び出し</dt>
                <dd className="font-semibold text-white">{app.apiCalls.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">AI リクエスト</dt>
                <dd className="font-semibold text-white">{app.tokenRequests.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">トークン</dt>
                <dd className="font-semibold text-white">{formatTokens(app.totalTokens)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">推定コスト</dt>
                <dd className="font-semibold text-amber-300">{formatUsd(app.estimatedCostUsd)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">平均応答</dt>
                <dd className="font-semibold text-white">{formatDuration(app.avgDurationMs)}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
