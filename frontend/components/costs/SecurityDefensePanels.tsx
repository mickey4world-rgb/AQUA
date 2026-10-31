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

const TRIAGE_STALE_HOURS = 36;

const LEVEL_STYLE = {
  ok: { label: "問題なし", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" },
  warn: { label: "要確認", className: "border-amber-400/30 bg-amber-500/10 text-amber-100" },
  critical: { label: "至急対応", className: "border-rose-400/40 bg-rose-500/15 text-rose-100" },
} as const;

const PRIORITY_LABEL = { now: "至急", today: "本日中", week: "今週" } as const;

function TriagePanel({ triage }: { triage: SecurityAnalyticsReport["latestTriage"] }) {
  if (!triage) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
        AI セキュリティ日次診断の結果がまだありません（毎朝 7 時に GitHub Actions が実行します）。
      </div>
    );
  }
  const stale = triage.ageHours > TRIAGE_STALE_HOURS;
  const style = LEVEL_STYLE[triage.level];
  return (
    <div className={`rounded-2xl border px-5 py-4 ${style.className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold">
          AI 日次診断: {style.label}
        </span>
        <span className="text-xs opacity-80">
          {formatTimestamp(triage.generatedAt)} 実行（{triage.dateJst}）
        </span>
        {triage.aiStatus === "failed" && (
          <span
            className="rounded-full bg-black/30 px-2 py-0.5 text-[10px]"
            title={triage.aiReason ?? undefined}
          >
            AI 要約失敗・ルール判定のみ
          </span>
        )}
      </div>
      {stale && (
        <p className="mt-2 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-100">
          診断が {triage.ageHours} 時間更新されていません。GitHub Actions の「Security Daily Triage」を確認してください。
        </p>
      )}
      <p className="mt-3 font-semibold">{triage.headline}</p>
      <p className="mt-1 text-sm opacity-90">{triage.summary}</p>
      {triage.incompleteSources.length > 0 && (
        <p className="mt-2 text-xs opacity-80">
          取得できなかった情報源: {triage.incompleteSources.join(", ")}
        </p>
      )}
      {triage.actions.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {triage.actions.slice(0, 6).map((action) => (
            <li key={`${action.priority}-${action.title}`}>
              <span className="mr-2 rounded bg-black/30 px-1.5 py-0.5 text-[10px]">
                {PRIORITY_LABEL[action.priority]}
              </span>
              {action.title}
              <span className="ml-1 opacity-70">— {action.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {triage.emailStatus === "failed" && (
        <p className="mt-2 text-xs text-rose-200">
          通知メールの送信に失敗しました{triage.emailError ? `（${triage.emailError}）` : ""}。
        </p>
      )}
      {triage.aiStatus === "failed" && triage.aiReason && (
        <p className="mt-1 text-xs opacity-70">AI 要約の失敗理由: {triage.aiReason}</p>
      )}
    </div>
  );
}

function AutoBlockPanel({ blocks }: { blocks: SecurityAnalyticsReport["activeAutoBlocks"] }) {
  if (blocks == null) {
    return (
      <p className="text-xs text-rose-300">自動ブロック一覧を取得できませんでした。</p>
    );
  }
  if (blocks.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        現在自動ブロック中の送信元はありません（10分間に繰り返し攻撃を検知すると全APIで1〜24時間遮断します）。
      </p>
    );
  }
  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-sm font-semibold text-white">自動ブロック中の送信元 {blocks.length} 件</h3>
      </div>
      <div className="divide-y divide-white/5">
        {blocks.slice(0, 20).map((block) => (
          <div key={`${block.lastBlockedAt}-${block.lastPath}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="text-white">{block.lastAttackLabel}</span>
            <span className="font-mono text-xs text-slate-400">{block.lastPath}</span>
            <span className="text-xs text-slate-400">{block.country ?? "不明"}・{block.blockCount}回目</span>
            <span className="text-xs text-rose-200">{formatTimestamp(block.blockedUntil)} まで</span>
          </div>
        ))}
      </div>
    </div>
  );
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

      <TriagePanel triage={report.latestTriage} />
      <AutoBlockPanel blocks={report.activeAutoBlocks} />

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
