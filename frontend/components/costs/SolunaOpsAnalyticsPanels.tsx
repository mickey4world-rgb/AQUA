"use client";

import { costsPanelClass, formatCurrency, formatPercent } from "@/lib/analytics-utils";
import type { SolunaOpsAnalyticsReport } from "@/lib/types/analytics";

type Props = {
  report: SolunaOpsAnalyticsReport;
};

function levelJa(level: string): string {
  if (level === "city") return "都市";
  if (level === "town") return "町";
  return "村";
}

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reasonJa(reason: string): string {
  if (reason === "dca" || reason.includes("dca")) return "DCA / 召喚";
  if (reason === "take-profit" || reason.includes("利確")) return "利確";
  if (reason === "stop-loss" || reason.includes("損切")) return "損切り";
  return reason || "—";
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function SolunaOpsAnalyticsPanels({ report }: Props) {
  const assets = report.assets;
  const boinc = report.boinc;
  const settlement = report.settlement;

  return (
    <div className="space-y-6">
      <div className={`${costsPanelClass} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
          Soluna Ops
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">
          {report.monthLabel} · 資産運用と社会貢献
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          bitFlyer の魔力タンク運用と、BOINC 解析パワー（拠点都市）の実績です。
          {report.updatedAt && (
            <span className="ml-2 text-slate-500">
              最終更新 {formatJst(report.updatedAt)}
            </span>
          )}
        </p>
        <p className="mt-3 text-[12px] text-slate-400">
          bitFlyer API:{" "}
          <span className={report.bitFlyerConfigured ? "text-emerald-300" : "text-amber-300"}>
            {report.bitFlyerConfigured ? "接続設定あり" : "未設定"}
          </span>
        </p>
      </div>

      {/* ── 資産運用 ── */}
      <section className={`${costsPanelClass} p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">bitFlyer</p>
            <h3 className="mt-1 text-lg font-semibold text-white">資産運用分析</h3>
          </div>
          {assets && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">
                {assets.battleMode === "attack" ? "攻撃バフ" : "防御モード"}
              </span>
              {assets.sleepMode && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                  おやすみモード
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                status: {assets.status}
              </span>
            </div>
          )}
        </div>

        {!assets ? (
          <p className="mt-4 text-sm text-slate-400">
            まだ資産台帳がありません。API キー設定後、Asset Trade を実行すると表示されます。
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="総魔力"
                value={formatCurrency(assets.totalYen)}
                hint={`前日比 ${assets.dayChangeYen >= 0 ? "+" : ""}${formatCurrency(assets.dayChangeYen)}`}
              />
              <Stat
                label="現金（守護巨兵）"
                value={formatCurrency(assets.cashYen)}
                hint={`Lv.${assets.golemLevel.toFixed(1)}`}
              />
              <Stat
                label="BTC（蒼竜）"
                value={`${assets.btcHeld.toFixed(4)} BTC`}
                hint={`${formatCurrency(assets.btcValueYen)} · Lv.${assets.dragonLevel.toFixed(1)}`}
              />
              <Stat
                label="月次ゴールド進捗"
                value={formatPercent(assets.targetProgressPct)}
                hint={`${formatCurrency(assets.monthlyRealizedPnlYen)} / 目標 ${formatCurrency(assets.monthlyTargetYen)}`}
              />
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${assets.sleepMode ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ width: `${Math.min(100, assets.targetProgressPct)}%` }}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="今月の買付" value={formatCurrency(assets.monthBuyYen)} />
              <Stat label="今月の売却" value={formatCurrency(assets.monthSellYen)} />
              <Stat
                label="今月の実現損益"
                value={`${assets.monthRealizedPnlYen >= 0 ? "+" : ""}${formatCurrency(assets.monthRealizedPnlYen)}`}
                hint={`${assets.monthTradeCount} 件の取引`}
              />
            </div>

            {(assets.btcPriceYen > 0 || assets.ethHeld > 0) && (
              <div className="mt-4 rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-[12px] text-slate-300">
                BTC 参照価格 {formatCurrency(assets.btcPriceYen)}
                {assets.ethHeld > 0 && (
                  <> · ETH {assets.ethHeld.toFixed(4)}（{formatCurrency(assets.ethValueYen)}）</>
                )}
                {" · "}元本 {formatCurrency(assets.principalYen)}
              </div>
            )}

            {(assets.solComment || assets.lunaComment) && (
              <div className="mt-4 space-y-1 text-[13px]">
                {assets.solComment && (
                  <p className="text-amber-50/90">⚔️ {assets.solComment}</p>
                )}
                {assets.lunaComment && (
                  <p className="text-indigo-100/90">📖 {assets.lunaComment}</p>
                )}
              </div>
            )}

            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                今月の取引明細
              </p>
              {assets.trades.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">今月の約定はまだありません（見送り含む）。</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-slate-500">
                      <tr className="border-b border-white/10">
                        <th className="px-2 py-2 font-medium">日時</th>
                        <th className="px-2 py-2 font-medium">売買</th>
                        <th className="px-2 py-2 font-medium">金額</th>
                        <th className="px-2 py-2 font-medium">BTC価格</th>
                        <th className="px-2 py-2 font-medium">理由</th>
                        <th className="px-2 py-2 font-medium">実現損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.trades.map((t) => (
                        <tr key={t.id} className="border-b border-white/5 text-slate-200">
                          <td className="px-2 py-2 whitespace-nowrap">{formatJst(t.createdAt)}</td>
                          <td
                            className={`px-2 py-2 font-semibold ${
                              t.side === "BUY" ? "text-sky-300" : "text-rose-300"
                            }`}
                          >
                            {t.side === "BUY" ? "買" : "売"}
                          </td>
                          <td className="px-2 py-2">{formatCurrency(t.sizeJpy)}</td>
                          <td className="px-2 py-2">{formatCurrency(t.priceBtc)}</td>
                          <td className="px-2 py-2">{reasonJa(t.reason)}</td>
                          <td className="px-2 py-2">
                            {t.realizedPnlJpy === undefined
                              ? "—"
                              : `${t.realizedPnlJpy >= 0 ? "+" : ""}${formatCurrency(t.realizedPnlJpy)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {assets.monthlySummaries.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  月次サマリー
                </p>
                <ul className="mt-2 space-y-1.5 text-[12px] text-slate-300">
                  {[...assets.monthlySummaries].reverse().map((m) => (
                    <li
                      key={m.month}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/5 bg-black/10 px-3 py-2"
                    >
                      <span>{m.month}</span>
                      <span>
                        実現 {formatCurrency(m.realizedPnlYen)} / 目標{" "}
                        {formatCurrency(m.targetProfitYen)}
                        {m.goalReached ? " · 達成" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── BOINC ── */}
      <section className={`${costsPanelClass} p-5`}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">BOINC</p>
          <h3 className="mt-1 text-lg font-semibold text-white">社会貢献・解析パワー</h3>
          <p className="mt-1 text-sm text-slate-400">
            討伐後の宇宙分析稼働と、拠点都市アクアピアへの変換状況です。
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="今月の稼働（実績）"
            value={`${boinc.monthActualMinutes} 分`}
            hint={`計画 ${boinc.monthPlannedMinutes} 分 · ${boinc.monthRunCount} 回`}
          />
          <Stat
            label="今月のクレジット"
            value={`${boinc.monthCreditGranted} cs`}
            hint={`タスク ${boinc.monthTasksCompleted} 件`}
          />
          <Stat
            label="累計稼働（実績）"
            value={`${boinc.lifetimeActualMinutes} 分`}
            hint={`計画累計 ${boinc.lifetimePlannedMinutes} 分`}
          />
          <Stat
            label="累計クレジット"
            value={`${boinc.lifetimeCreditGranted} cs`}
            hint={`タスク累計 ${boinc.lifetimeTasksCompleted} 件`}
          />
        </div>

        {settlement && (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">拠点都市</p>
            <p className="mt-1 text-base font-semibold text-white">
              {settlement.settlementName}（{levelJa(settlement.settlementLevel)}）
            </p>
            <p className="mt-1 text-[12px] text-emerald-50/90">
              累積開拓パワー {settlement.cumulativeMinutes} 分 · 宇宙分析スロット{" "}
              {settlement.analysisSlots}
            </p>
            {settlement.latestHeadline && (
              <p className="mt-2 text-[13px] text-emerald-100">{settlement.latestHeadline}</p>
            )}
            {settlement.latestTopic && (
              <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{settlement.latestTopic}</p>
            )}
            {settlement.facilities.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12px] text-slate-300">
                {settlement.facilities.map((f) => (
                  <li key={f.id}>
                    · {f.name}（{f.location} / {f.levelLabel}）
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            実行履歴
          </p>
          {boinc.runs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">BOINC 実行履歴はまだありません。</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-2 font-medium">日時</th>
                    <th className="px-2 py-2 font-medium">計画</th>
                    <th className="px-2 py-2 font-medium">実績</th>
                    <th className="px-2 py-2 font-medium">クレジット</th>
                    <th className="px-2 py-2 font-medium">タスク</th>
                    <th className="px-2 py-2 font-medium">状態</th>
                    <th className="px-2 py-2 font-medium">プロジェクト</th>
                  </tr>
                </thead>
                <tbody>
                  {boinc.runs.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 text-slate-200">
                      <td className="px-2 py-2 whitespace-nowrap">{formatJst(r.createdAt)}</td>
                      <td className="px-2 py-2">{r.plannedMinutes} 分</td>
                      <td className="px-2 py-2">
                        {r.actualMinutes === null ? "—" : `${r.actualMinutes} 分`}
                      </td>
                      <td className="px-2 py-2">
                        {r.creditGranted === null ? "—" : `${r.creditGranted} cs`}
                      </td>
                      <td className="px-2 py-2">
                        {r.tasksCompleted === null ? "—" : r.tasksCompleted}
                      </td>
                      <td className="px-2 py-2">{r.status}</td>
                      <td className="px-2 py-2">
                        {r.projectUrl ? (
                          <a
                            href={r.projectUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 underline"
                          >
                            {r.projectName ?? "project"}
                          </a>
                        ) : (
                          r.projectName ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
