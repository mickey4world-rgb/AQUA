import { APP_LABELS, featureLabel } from "@/lib/analytics-constants";
import { costsPanelClass, formatDuration, formatTokens, formatUsd } from "@/lib/analytics-utils";
import type { AccessLog } from "@/lib/types/access-log";
import type { TokenUsage } from "@/lib/types/token-usage";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

type UsageHistoryProps = {
  tokens: TokenUsage[];
  access: AccessLog[];
};

export default function UsageHistory({ tokens, access }: UsageHistoryProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">AI トークン履歴</h2>
        </div>
        {tokens.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">履歴がありません。</p>
        ) : (
          <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
            {tokens.map((row) => (
              <li key={row.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{featureLabel(row.feature)}</p>
                  <p className="text-amber-300">{formatUsd(row.estimatedCostUsd ?? 0)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {formatTimestamp(row.createdAt)} · {formatTokens(row.totalTokens)} tokens ·{" "}
                  {row.model}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">API アクセスログ</h2>
        </div>
        {access.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">アクセスログはまだありません。</p>
        ) : (
          <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
            {access.map((row) => (
              <li key={row.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">
                    {APP_LABELS[row.app]} · {featureLabel(row.feature)}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      row.statusCode < 400
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {row.statusCode}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {formatTimestamp(row.createdAt)} · {row.method} {row.path} ·{" "}
                  {formatDuration(row.durationMs)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
