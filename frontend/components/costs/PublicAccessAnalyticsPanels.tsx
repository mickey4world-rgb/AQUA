"use client";

import { costsPanelClass } from "@/lib/analytics-utils";
import type {
  PublicAccessAnalyticsBucketRow,
  PublicAccessAnalyticsReport,
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

function BarList({
  rows,
  valueKey = "pageViews",
  accent = "from-cyan-400 to-teal-300",
}: {
  rows: PublicAccessAnalyticsBucketRow[];
  valueKey?: "pageViews" | "uniqueVisitors";
  accent?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row[valueKey]));
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">データがありません。</p>;
  }
  return (
    <div className="space-y-2 px-5 py-4">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{row.label}</span>
            <span className="shrink-0 font-mono text-cyan-200">
              PV {row.pageViews} · UU {row.uniqueVisitors}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${accent}`}
              style={{ width: `${(row[valueKey] / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "PV（同一含む）",
            value: report.summary.pageViewsIncludingRepeats.toLocaleString("ja-JP"),
          },
          {
            label: "UU（同一除く）",
            value: String(report.summary.uniqueVisitorsExcludingRepeats),
          },
          { label: "計測ページ種別", value: String(report.summary.uniquePages) },
          {
            label: "平均 PV/人",
            value:
              report.summary.uniqueVisitors > 0
                ? (
                    report.summary.pageViews / report.summary.uniqueVisitors
                  ).toFixed(1)
                : "—",
          },
        ].map((card) => (
          <div key={card.label} className={`${costsPanelClass} px-5 py-4`}>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
            <p className="mt-2 font-mono text-2xl text-cyan-100">{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`${costsPanelClass} px-5 py-4 text-xs leading-6 text-slate-400`}>
        {report.notes.map((note) => (
          <p key={note}>· {note}</p>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">利用区分（HOME / SHOWCASE 等）</h2>
            <p className="mt-1 text-xs text-slate-500">PV=同一含む · UU=同一除く</p>
          </div>
          <BarList rows={report.byGroup} accent="from-fuchsia-400 to-cyan-300" />
        </div>
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">デバイス種別</h2>
          </div>
          <BarList rows={report.byDevice} accent="from-amber-300 to-orange-400" />
        </div>
      </div>

      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">ページ別 — HOME / SHOWCASE / 詳細</h2>
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
                  <th className="px-5 py-3 font-medium">区分</th>
                  <th className="px-5 py-3 font-medium">PV（含む）</th>
                  <th className="px-5 py-3 font-medium">UU（除く）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.byPage.map((row) => (
                  <tr
                    key={`${row.pathname}:${row.section ?? ""}`}
                    className="hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3 font-medium text-white">{row.pageLabel}</td>
                    <td className="px-5 py-3 text-slate-400">{row.pageGroupLabel}</td>
                    <td className="px-5 py-3 font-mono text-cyan-200">{row.pageViews}</td>
                    <td className="px-5 py-3 text-slate-300">{row.uniqueVisitors}</td>
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
            <h2 className="text-sm font-semibold text-white">ブラウザ</h2>
          </div>
          <BarList rows={report.byBrowser} />
        </div>
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">OS / PC</h2>
          </div>
          <BarList rows={report.byOs} accent="from-violet-400 to-fuchsia-300" />
        </div>
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">国・地域（取得できる場合）</h2>
          </div>
          <BarList rows={report.byCountry} accent="from-emerald-400 to-cyan-300" />
        </div>
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">言語 / タイムゾーン</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <BarList rows={report.byLanguage} accent="from-sky-400 to-indigo-300" />
            <BarList rows={report.byTimezone} accent="from-rose-300 to-amber-300" />
          </div>
        </div>
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
                    {formatTimestamp(row.createdAt)} · {row.browser}/{row.os} · {row.device}
                    {row.screen !== "—" ? ` · ${row.screen}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.country !== "—" ? `${row.country}` : "国不明"}
                    {row.city !== "—" ? ` / ${row.city}` : ""}
                    {row.timezone !== "—" ? ` · ${row.timezone}` : ""}
                    {row.language !== "—" ? ` · ${row.language}` : ""}
                    {" · 参照: "}
                    {row.referrer}
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
