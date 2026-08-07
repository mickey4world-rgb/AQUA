import { costsPanelClass, formatCurrency, formatUsd } from "@/lib/analytics-utils";
import type { AzureInfraCostSummary, QuotaSummary } from "@/lib/types/analytics";

type AzureInfraCostPanelProps = {
  azure: AzureInfraCostSummary | null;
  quota: QuotaSummary;
  monthLabel: string;
};

const SERVICE_COLORS = [
  "from-sky-500 to-blue-400",
  "from-violet-500 to-purple-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
  "from-cyan-500 to-sky-400",
];

export default function AzureInfraCostPanel({ azure, quota, monthLabel }: AzureInfraCostPanelProps) {
  if (!azure) {
    return (
      <div className={`${costsPanelClass} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300/80">
          Azure Infrastructure
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">Azure 実コスト（未設定）</h2>
        <p className="mt-3 text-sm text-slate-400">
          サブスクリプションの実際の請求額を表示するには、SWA の環境変数に以下を設定し、
          Managed Identity またはサービスプリンシパルに Cost Management Reader 権限を付与してください。
        </p>
        <ul className="mt-4 space-y-1 text-xs text-slate-500">
          <li>AZURE_SUBSCRIPTION_ID</li>
          <li>AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET（または Managed Identity）</li>
          <li>任意: AZURE_COST_RESOURCE_GROUP=rg-personal-apps-prod</li>
        </ul>
      </div>
    );
  }

  const maxServiceCost = Math.max(...azure.byService.map((s) => s.costAmount), 1);
  const maxDailyCost = Math.max(...azure.daily.map((d) => d.costAmount), 1);

  return (
    <div className={`${costsPanelClass} p-6`}>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300/80">
        Azure Infrastructure
      </p>
      <h2 className="mt-2 text-xl font-bold text-white">{monthLabel} の Azure 実コスト</h2>
      <p className="mt-1 text-xs text-slate-500">{azure.scopeLabel}</p>

      {azure.error && (
        <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {azure.error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-4">
          <p className="text-xs text-slate-400">Azure 合計（サブスクリプション全体・税抜）</p>
          <p className="mt-1 text-2xl font-bold text-sky-200">
            {formatCurrency(azure.totalCost, azure.currency)}
          </p>
          {azure.resourceGroupCost != null && (
            <p className="mt-1 text-[10px] text-slate-500">
              RG 内参考: {formatCurrency(azure.resourceGroupCost, azure.currency)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
          <p className="text-xs text-slate-400">AI 推定（OpenAI トークン）</p>
          <p className="mt-1 text-2xl font-bold text-amber-200">
            {formatUsd(quota.estimatedCostUsd)}
          </p>
        </div>
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4">
          <p className="text-xs text-slate-400">サービス数</p>
          <p className="mt-1 text-2xl font-bold text-violet-200">
            {azure.byService.length}
          </p>
        </div>
      </div>

      {azure.byService.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">サービス別内訳</h3>
          <div className="mt-3 space-y-3">
            {azure.byService.map((row, index) => {
              const width = Math.max(4, (row.costAmount / maxServiceCost) * 100);
              const color = SERVICE_COLORS[index % SERVICE_COLORS.length];
              return (
                <div key={row.service}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-300">{row.label}</span>
                    <span className="font-medium text-white">
                      {formatCurrency(row.costAmount, azure.currency)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${color}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {azure.daily.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">日別 Azure コスト</h3>
          <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-2">
            {azure.daily.map((point) => {
              const height = Math.max(8, (point.costAmount / maxDailyCost) * 100);
              return (
                <div key={point.date} className="flex min-w-[2rem] flex-col items-center gap-2">
                  <div
                    title={`${point.date}: ${formatCurrency(point.costAmount, azure.currency)}`}
                    className="w-6 rounded-t-md bg-gradient-to-t from-sky-700 to-sky-300"
                    style={{ height }}
                  />
                  <span className="text-[10px] text-slate-500">{point.date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {azure.note && (
        <p className="mt-4 text-xs text-slate-500">{azure.note}</p>
      )}
    </div>
  );
}
