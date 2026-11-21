"use client";

import { costsPanelClass } from "@/lib/analytics-utils";
import SecurityTriagePanel from "@/components/costs/SecurityTriagePanel";
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

const JUDGMENT_TONE: Record<
  SecurityAnalyticsReport["worldIssues"][number]["judgment"],
  string
> = {
  affected: "border-rose-400/40 bg-rose-500/15 text-rose-50",
  watch: "border-amber-400/30 bg-amber-500/10 text-amber-50",
  mitigated: "border-emerald-400/30 bg-emerald-500/10 text-emerald-50",
  not_applicable: "border-white/10 bg-white/[0.03] text-slate-200",
};

function AutoBlockPanel({ blocks }: { blocks: SecurityAnalyticsReport["activeAutoBlocks"] }) {
  if (blocks == null) {
    return (
      <p className="px-5 py-4 text-xs text-rose-300">自動ブロック一覧を取得できませんでした。</p>
    );
  }
  if (blocks.length === 0) {
    return (
      <p className="px-5 py-4 text-xs text-slate-500">
        現在自動ブロック中の送信元はありません（10分間に繰り返し攻撃を検知すると全APIで1〜24時間遮断します）。
      </p>
    );
  }
  return (
    <div className="divide-y divide-white/5">
      {blocks.slice(0, 20).map((block) => (
        <div
          key={`${block.lastBlockedAt}-${block.lastPath}`}
          className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
        >
          <span className="text-white">{block.lastAttackLabel}</span>
          <span className="font-mono text-xs text-slate-400">{block.lastPath}</span>
          <span className="text-xs text-slate-400">
            {block.country ?? "不明"}・{block.blockCount}回目
          </span>
          <span className="text-xs text-rose-200">
            {formatTimestamp(block.blockedUntil)} まで
          </span>
        </div>
      ))}
    </div>
  );
}

function StoryGuide() {
  const steps = [
    { n: "1", title: "いまの構成", desc: "入口から供給チェーンまで、守りの層" },
    { n: "2", title: "脆弱性対応", desc: "未解決の穴と、世界の重要問題との照合" },
    { n: "3", title: "いま防御しているところ", desc: "誰が・どこを・どう止められたか" },
    { n: "4", title: "環境・ソースの改善", desc: "自動パッチとホスト揃えの進捗" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((s) => (
        <li key={s.n} className={`${costsPanelClass} px-4 py-3`}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-rose-300/80">
            読み方 {s.n}
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{s.title}</p>
          <p className="mt-1 text-xs text-slate-400">{s.desc}</p>
        </li>
      ))}
    </ol>
  );
}

export default function SecurityDefensePanels({
  report,
}: {
  report: SecurityAnalyticsReport;
}) {
  const worldTone =
    report.worldIssuesSummary.level === "critical"
      ? "border-rose-400/40 bg-rose-500/15 text-rose-50"
      : report.worldIssuesSummary.level === "warn"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-50"
        : "border-emerald-400/30 bg-emerald-500/10 text-emerald-50";

  const cards = [
    { label: "この月の遮断", value: report.summary.blockedEvents },
    { label: "高重要度", value: report.summary.highSeverityEvents },
    { label: "識別された送信元", value: report.summary.uniqueSources },
    { label: "対象API・ページ", value: report.summary.affectedPaths },
  ];

  return (
    <section className="space-y-6" aria-labelledby="security-defense-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-300/80">
          Security Defense
        </p>
        <h2 id="security-defense-heading" className="mt-2 text-xl font-semibold text-white">
          外部攻撃・不正アクセスの防御状況
        </h2>
        <p className="mt-2 text-sm text-slate-400">{report.coverageNote}</p>
        <p className="mt-1 text-xs text-slate-500">
          表示月: {report.monthLabel}（ページ上部の月切替で過去の攻撃履歴を確認できます）
        </p>
      </div>

      <StoryGuide />

      {/* 1. 構成 */}
      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">1. いまの構成（守りの層）</h3>
          <p className="mt-1 text-xs text-slate-500">
            上から順にインターネットに近い層です。どこで何を止めているかを先に把握します。
          </p>
        </div>
        <div className="grid gap-0 divide-y divide-white/5 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {report.architectureLayers.map((layer) => (
            <div key={layer.id} className="px-5 py-4">
              <p className="text-sm font-medium text-white">{layer.title}</p>
              <p className="mt-1 text-xs text-slate-400">{layer.role}</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {layer.defenses.map((d) => (
                  <li key={d}>・{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 脆弱性 + 世界の重要問題 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">2. 脆弱性対応と世界の重要問題</h3>
          <p className="mt-1 text-sm text-slate-400">
            未解決の穴（依存・コード・秘密情報）と、世の中の大事件がこの環境に当たるかを並べて見ます。
          </p>
        </div>

        <div className={`rounded-2xl border px-5 py-4 ${worldTone}`}>
          <p className="text-sm font-semibold">世界の重要問題（この環境での判定）</p>
          <p className="mt-1 text-sm opacity-90">{report.worldIssuesSummary.text}</p>
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">重要問題リストと該当判定</h4>
          </div>
          <div className="divide-y divide-white/5">
            {report.worldIssues.map((issue) => (
              <div key={issue.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${JUDGMENT_TONE[issue.judgment]}`}
                  >
                    {issue.judgmentLabel}
                  </span>
                  <span className="text-[11px] text-slate-500">{issue.publishedAt}</span>
                  <a
                    href={issue.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-cyan-300 hover:text-cyan-200"
                  >
                    出典
                  </a>
                </div>
                <p className="mt-2 text-sm font-medium text-white">{issue.title}</p>
                <p className="mt-1 text-xs text-slate-400">{issue.reason}</p>
              </div>
            ))}
          </div>
        </div>

        <SecurityTriagePanel
          key={`${report.month}-${report.latestTriage?.generatedAt ?? "none"}`}
          triage={report.latestTriage}
          history={report.triageHistory}
          sectionTitle="脆弱性の日次診断と改善履歴"
        />
      </div>

      {/* 3. 防御 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            3. いま防御しているところ（{report.monthLabel}）
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            どの国から、どの機能へ、どんな攻撃が来て、どう止めたか。
          </p>
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

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h4 className="text-sm font-semibold text-white">攻撃の読み取り（国 → 場所）</h4>
            <p className="mt-1 text-xs text-slate-500">
              世の中の事故でもよく見る「どこから・どこへ」を、この月の遮断記録から集計しています。
            </p>
          </div>
          {report.attackInsights.narrative.length > 0 && (
            <ul className="space-y-1 border-b border-white/5 px-5 py-3 text-sm text-slate-300">
              {report.attackInsights.narrative.map((line) => (
                <li key={line}>・{line}</li>
              ))}
            </ul>
          )}
          {report.attackInsights.flows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">この月の攻撃フローはありません。</p>
          ) : (
            <div className="max-h-[22rem] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-950/95 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">攻撃元（国）</th>
                    <th className="px-3 py-3 font-medium">攻撃場所</th>
                    <th className="px-3 py-3 font-medium">例（パス）</th>
                    <th className="px-5 py-3 font-medium text-right">件数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {report.attackInsights.flows.map((row) => (
                    <tr key={`${row.country}-${row.targetKind}`}>
                      <td className="px-5 py-3 text-slate-200">{row.country}</td>
                      <td className="px-3 py-3 text-white">{row.targetLabel}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-400">
                        {row.pathSample}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-amber-200">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className={`${costsPanelClass} overflow-hidden`}>
            <div className="border-b border-white/10 px-5 py-4">
              <h4 className="text-sm font-semibold text-white">攻撃・異常種別と防御策</h4>
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
              <h4 className="text-sm font-semibold text-white">狙われやすい場所（機能別）</h4>
            </div>
            {report.attackInsights.byTarget.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">集計データはありません。</p>
            ) : (
              <div className="divide-y divide-white/5">
                {report.attackInsights.byTarget.map((row) => (
                  <div
                    key={row.targetKind}
                    className="flex items-center justify-between px-5 py-3 text-sm"
                  >
                    <span className="text-slate-300">{row.targetLabel}</span>
                    <span className="font-mono text-amber-200">{row.count} 回</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h4 className="text-sm font-semibold text-white">
              自動ブロック中の送信元
              {report.activeAutoBlocks ? ` ${report.activeAutoBlocks.length} 件` : ""}
            </h4>
          </div>
          <AutoBlockPanel blocks={report.activeAutoBlocks} />
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-4">
            <h4 className="text-sm font-semibold text-white">直近の防御記録（この月）</h4>
            <p className="mt-1 text-xs text-slate-500">
              どこから・何を試み・どの対策で遮断したか。過去月はページ上部の月切替で切り替えます。
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
                        <p>
                          {event.country} / {event.region}
                        </p>
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
                      <td className="max-w-sm px-5 py-3 text-slate-400">{event.mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        4. 環境・ソースの改善（自動パッチ適用・待ち PR・ホスト版揃え）は上の「脆弱性の日次診断と改善履歴」にまとめています。過去の診断日を選ぶと、その日時点の判定と改善状況を確認できます。
      </p>
    </section>
  );
}
