import { APP_LABELS, featureLabel } from "@/lib/analytics-constants";
import { appAccentStyles, costsPanelClass, formatTokens, formatUsd } from "@/lib/analytics-utils";
import type { FeatureUsageSummary } from "@/lib/types/analytics";

type FeatureBreakdownTableProps = {
  features: FeatureUsageSummary[];
};

export default function FeatureBreakdownTable({ features }: FeatureBreakdownTableProps) {
  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">機能別トークン分析</h2>
      </div>
      {features.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">AI 利用記録はまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">アプリ</th>
                <th className="px-5 py-3">機能</th>
                <th className="px-5 py-3">回数</th>
                <th className="px-5 py-3">トークン</th>
                <th className="px-5 py-3">コスト</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {features.map((row) => {
                const accent = appAccentStyles[row.app];
                return (
                  <tr key={row.feature}>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${accent.bg} ${accent.text}`}>
                        {APP_LABELS[row.app]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white">{featureLabel(row.feature)}</td>
                    <td className="px-5 py-3 text-slate-300">{row.requests}</td>
                    <td className="px-5 py-3 text-slate-300">{formatTokens(row.totalTokens)}</td>
                    <td className="px-5 py-3 text-amber-300">{formatUsd(row.estimatedCostUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
