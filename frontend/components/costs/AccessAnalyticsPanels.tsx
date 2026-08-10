"use client";

import { costsPanelClass, formatDuration } from "@/lib/analytics-utils";
import type {
  AccessAnalyticsPageSummary,
  AccessAnalyticsReport,
  AccessAnalyticsUserPageRow,
  AccessAnalyticsUserSummary,
} from "@/lib/types/analytics";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function SummaryCards({ report }: { report: AccessAnalyticsReport }) {
  const cards = [
    { label: "API 呼び出し", value: report.summary.totalApiCalls.toLocaleString("ja-JP") },
    { label: "利用ユーザー", value: String(report.summary.uniqueUsers) },
    { label: "ページ種別", value: String(report.summary.uniquePages) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className={`${costsPanelClass} px-5 py-4`}>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
          <p className="mt-2 font-mono text-2xl text-amber-100">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function UserTable({ rows }: { rows: AccessAnalyticsUserSummary[] }) {
  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">だれが — ユーザー別集計</h2>
        <p className="mt-1 text-xs text-slate-500">利用回数の多い順</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">この月のアクセスはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">ユーザー</th>
                <th className="px-5 py-3 font-medium">回数</th>
                <th className="px-5 py-3 font-medium">主な利用</th>
                <th className="px-5 py-3 font-medium">モジュール</th>
                <th className="px-5 py-3 font-medium">最終アクセス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.userId} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{row.displayName}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </td>
                  <td className="px-5 py-3 font-mono text-amber-200">{row.apiCalls}</td>
                  <td className="px-5 py-3 text-slate-300">{row.topFeatureLabel}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.appLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {formatTimestamp(row.lastAccessAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PageTable({ rows }: { rows: AccessAnalyticsPageSummary[] }) {
  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">何を — ページ別集計</h2>
        <p className="mt-1 text-xs text-slate-500">モジュール × 機能ごとの API 呼び出し</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">この月のアクセスはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">ページ</th>
                <th className="px-5 py-3 font-medium">回数</th>
                <th className="px-5 py-3 font-medium">利用者数</th>
                <th className="px-5 py-3 font-medium">内訳（だれが）</th>
                <th className="px-5 py-3 font-medium">最終</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={`${row.app}:${row.feature}`} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{row.pageLabel}</p>
                    <p className="font-mono text-[10px] text-slate-500">
                      {row.app}/{row.feature}
                    </p>
                  </td>
                  <td className="px-5 py-3 font-mono text-amber-200">{row.apiCalls}</td>
                  <td className="px-5 py-3 text-slate-300">{row.uniqueUsers}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.users.slice(0, 4).map((user) => (
                        <span
                          key={user.userId}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          {user.displayName} ({user.apiCalls})
                        </span>
                      ))}
                      {row.users.length > 4 && (
                        <span className="text-[10px] text-slate-500">
                          +{row.users.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {formatTimestamp(row.lastAccessAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserPageMatrix({ rows }: { rows: AccessAnalyticsUserPageRow[] }) {
  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">だれが × 何を — 詳細マトリクス</h2>
        <p className="mt-1 text-xs text-slate-500">ユーザーごとのページ利用内訳</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">この月のアクセスはありません。</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-950/95 text-left text-xs uppercase tracking-wider text-slate-500 backdrop-blur">
              <tr>
                <th className="px-5 py-3 font-medium">ユーザー</th>
                <th className="px-5 py-3 font-medium">ページ</th>
                <th className="px-5 py-3 font-medium">回数</th>
                <th className="px-5 py-3 font-medium">平均応答</th>
                <th className="px-5 py-3 font-medium">最終</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr
                  key={`${row.userId}:${row.app}:${row.feature}`}
                  className="hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3 text-white">{row.displayName}</td>
                  <td className="px-5 py-3 text-slate-300">{row.pageLabel}</td>
                  <td className="px-5 py-3 font-mono text-amber-200">{row.apiCalls}</td>
                  <td className="px-5 py-3 text-slate-400">{formatDuration(row.avgDurationMs)}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {formatTimestamp(row.lastAccessAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentAccessList({ report }: { report: AccessAnalyticsReport }) {
  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">直近のアクセス</h2>
      </div>
      {report.recentAccess.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">履歴がありません。</p>
      ) : (
        <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
          {report.recentAccess.map((row) => (
            <li key={row.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-white">
                  <span className="text-cyan-200">{row.displayName}</span>
                  <span className="mx-2 text-slate-600">→</span>
                  {row.pageLabel}
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
  );
}

type AccessAnalyticsPanelsProps = {
  report: AccessAnalyticsReport;
};

export default function AccessAnalyticsPanels({ report }: AccessAnalyticsPanelsProps) {
  return (
    <div className="space-y-6">
      <SummaryCards report={report} />
      <UserTable rows={report.byUser} />
      <PageTable rows={report.byPage} />
      <UserPageMatrix rows={report.byUserPage} />
      <RecentAccessList report={report} />
    </div>
  );
}
