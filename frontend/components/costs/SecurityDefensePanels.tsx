"use client";

import { costsPanelClass } from "@/lib/analytics-utils";
import type { SecurityAnalyticsReport } from "@/lib/types/analytics";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function severityClass(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "bg-rose-500/15 text-rose-200";
  if (severity === "medium") return "bg-amber-500/15 text-amber-200";
  return "bg-sky-500/15 text-sky-200";
}

export default function SecurityDefensePanels({
  report,
}: {
  report: SecurityAnalyticsReport;
}) {
  const cards = [
    { label: "防御・遮断", value: report.summary.blockedEvents },
    { label: "高重要度", value: report.summary.highSeverityEvents },
    { label: "識別された送信元", value: report.summary.uniqueSources },
    { label: "対象API・ページ", value: report.summary.affectedPaths },
  ];

  return (
    <section className="space-y-5" aria-labelledby="security-defense-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-300/80">
          Security Defense
        </p>
        <h2 id="security-defense-heading" className="mt-2 text-xl font-semibold text-white">
          外部攻撃・不正アクセスの防御状況
        </h2>
        <p className="mt-2 text-sm text-slate-400">{report.coverageNote}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`${costsPanelClass} px-5 py-4`}>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
            <p className="mt-2 font-mono text-2xl text-rose-100">
              {card.value.toLocaleString("ja-JP")} 回
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">攻撃・異常種別と防御策</h3>
          </div>
          {report.byType.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">記録された遮断はありません。</p>
          ) : (
            <div className="divide-y divide-white/5">
              {report.byType.map((row) => (
                <div key={row.eventType} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{row.label}</p>
                    <span className="font-mono text-rose-200">{row.count} 回</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{row.mitigation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">送信元の国・地域</h3>
            <p className="mt-1 text-xs text-slate-500">
              Azureが付与した地域情報。IPアドレスは保存せず日次ハッシュ化します。
            </p>
          </div>
          {report.byCountry.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">地域情報はありません。</p>
          ) : (
            <div className="divide-y divide-white/5">
              {report.byCountry.slice(0, 12).map((row) => (
                <div
                  key={row.country}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <span className="text-slate-300">{row.country}</span>
                  <span className="font-mono text-amber-200">{row.count} 回</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">直近の防御記録</h3>
          <p className="mt-1 text-xs text-slate-500">
            どこから・何を試み・どの対策で遮断したかを確認できます。
          </p>
        </div>
        {report.recentEvents.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">防御記録はありません。</p>
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-950/95 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">日時・重要度</th>
                  <th className="px-5 py-3 font-medium">送信元</th>
                  <th className="px-5 py-3 font-medium">攻撃・異常</th>
                  <th className="px-5 py-3 font-medium">対象</th>
                  <th className="px-5 py-3 font-medium">防御策</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.recentEvents.map((event) => (
                  <tr key={event.id} className="align-top hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="text-slate-300">{formatTimestamp(event.createdAt)}</p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${severityClass(event.severity)}`}
                      >
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">
                      <p>{event.country} / {event.region}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        {event.sourceHash}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-white">{event.attackLabel}</td>
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs text-slate-300">
                        {event.method} {event.path}
                      </p>
                      <p className="mt-1 text-xs text-rose-300">HTTP {event.statusCode}</p>
                    </td>
                    <td className="max-w-sm px-5 py-3 text-slate-400">
                      {event.mitigation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
