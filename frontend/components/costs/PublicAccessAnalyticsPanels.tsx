"use client";

import { costsPanelClass } from "@/lib/analytics-utils";
import type { PublicAccessAnalyticsReport } from "@/lib/types/analytics";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

type PublicAccessAnalyticsPanelsProps = {
  report: PublicAccessAnalyticsReport;
};

export default function PublicAccessAnalyticsPanels({
  report,
}: PublicAccessAnalyticsPanelsProps) {
  const maxDayViews = Math.max(1, ...report.byDay.map((d) => d.pageViews));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "ページビュー", value: report.summary.pageViews.toLocaleString("ja-JP") },
          { label: "ユニーク訪問者", value: String(report.summary.uniqueVisitors) },
          { label: "公開ページ数", value: String(report.summary.uniquePages) },
        ].map((card) => (
          <div key={card.label} className={`${costsPanelClass} px-5 py-4`}>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
            <p className="mt-2 font-mono text-2xl text-cyan-100">{card.value}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        計測対象: ホーム / Studio ショーケース / ログイン（認証不要ページ）。
        訪問者 ID は端末ローカル UUID をハッシュ化した匿名 ID です。
      </p>

      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">どのページ — 公開フロント別</h2>
        </div>
        {report.byPage.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            この月の公開ページアクセスはまだありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">ページ</th>
                  <th className="px-5 py-3 font-medium">PV</th>
                  <th className="px-5 py-3 font-medium">UU</th>
                  <th className="px-5 py-3 font-medium">パス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.byPage.map((row) => (
                  <tr key={row.pathname} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium text-white">{row.pageLabel}</td>
                    <td className="px-5 py-3 font-mono text-cyan-200">{row.pageViews}</td>
                    <td className="px-5 py-3 text-slate-300">{row.uniqueVisitors}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.pathname}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">日別推移</h2>
        </div>
        {report.byDay.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">データがありません。</p>
        ) : (
          <div className="space-y-2 px-5 py-4">
            {report.byDay.map((row) => (
              <div key={row.date}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">{row.date}</span>
                  <span className="text-slate-300">
                    PV {row.pageViews} · UU {row.uniqueVisitors}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-300"
                    style={{ width: `${(row.pageViews / maxDayViews) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">参照元（Referrer）</h2>
          </div>
          {report.byReferrer.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">データがありません。</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {report.byReferrer.map((row) => (
                <li
                  key={row.referrer}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <span className="text-slate-300">{row.referrer}</span>
                  <span className="font-mono text-cyan-200">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">直近の訪問</h2>
          </div>
          {report.recentViews.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">履歴がありません。</p>
          ) : (
            <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
              {report.recentViews.map((row) => (
                <li key={row.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-white">{row.pageLabel}</p>
                    <span className="font-mono text-[10px] text-slate-500">{row.visitorMask}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatTimestamp(row.createdAt)} · {row.device} · 参照: {row.referrer}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
