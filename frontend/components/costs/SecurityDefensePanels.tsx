"use client";

import { useMemo, useState } from "react";
import SecurityTriagePanel from "@/components/costs/SecurityTriagePanel";
import {
  AreaChart,
  Donut,
  HBar,
  Heatmap,
  Legend,
  SectionHeader,
  StatTile,
  formatJst,
  glassPanel,
  type DonutSegment,
} from "@/components/costs/security/SecurityVisuals";
import type { SecurityAnalyticsReport } from "@/lib/types/analytics";

type Judgment = SecurityAnalyticsReport["worldIssues"][number]["judgment"];

const JUDGMENT_STYLE: Record<Judgment, { color: string; chip: string; short: string }> = {
  affected: { color: "#f43f5e", chip: "border-rose-400/50 bg-rose-500/20 text-rose-100", short: "問題あり" },
  watch: { color: "#fbbf24", chip: "border-amber-400/40 bg-amber-500/15 text-amber-100", short: "監視" },
  mitigated: { color: "#34d399", chip: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100", short: "対策済み" },
  not_applicable: { color: "#64748b", chip: "border-white/10 bg-white/[0.04] text-slate-300", short: "非該当" },
};

const LEVEL_STYLE = {
  ok: { label: "問題なし", tone: "good" as const },
  warn: { label: "要確認", tone: "warn" as const },
  critical: { label: "至急対応", tone: "bad" as const },
};

function severityClass(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "bg-rose-500/20 text-rose-100";
  if (severity === "medium") return "bg-amber-500/15 text-amber-100";
  return "bg-sky-500/15 text-sky-100";
}

function fillMonthDays(month: string, byDay: Array<{ date: string; count: number }>) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return byDay.map((d) => ({ label: d.date.slice(5), value: d.count }));
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const today = new Date();
  const isCurrent = today.getUTCFullYear() === y && today.getUTCMonth() + 1 === mo;
  const last = isCurrent ? today.getUTCDate() : days;
  const map = new Map(byDay.map((d) => [d.date, d.count]));
  return Array.from({ length: last }, (_, i) => {
    const date = `${m[1]}-${m[2]}-${String(i + 1).padStart(2, "0")}`;
    return { label: date.slice(5).replace("-", "/"), value: map.get(date) ?? 0 };
  });
}

function ArchitecturePipeline({ layers }: { layers: SecurityAnalyticsReport["architectureLayers"] }) {
  const accents = [
    "from-cyan-400 to-sky-500",
    "from-violet-400 to-fuchsia-500",
    "from-rose-400 to-orange-400",
    "from-emerald-400 to-teal-500",
  ];
  return (
    <div className="relative grid gap-4 lg:grid-cols-4">
      <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-cyan-400/0 via-fuchsia-400/50 to-emerald-400/0 lg:block" />
      {layers.map((layer, i) => (
        <div key={layer.id} className={`${glassPanel} p-4`}>
          <div className="flex items-center gap-3">
            <span
              className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[i % accents.length]} font-mono text-lg font-bold text-slate-950 shadow-lg`}
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{layer.title.replace(/^[①②③④]\s*/, "")}</p>
              <p className="text-[11px] text-slate-400">{layer.role}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {layer.defenses.map((d) => (
              <li key={d} className="flex gap-2 text-xs text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WorldIssuesPanel({ report }: { report: SecurityAnalyticsReport }) {
  const [filter, setFilter] = useState<Judgment | "relevant" | "all">("relevant");
  const issues = report.worldIssues;
  const counts: Record<Judgment, number> = { affected: 0, watch: 0, mitigated: 0, not_applicable: 0 };
  for (const i of issues) counts[i.judgment] += 1;
  const segments: DonutSegment[] = (Object.keys(counts) as Judgment[]).map((k) => ({
    label: JUDGMENT_STYLE[k].short,
    value: counts[k],
    color: JUDGMENT_STYLE[k].color,
  }));
  const meta = report.worldFeedMeta;
  const visible = issues.filter((i) =>
    filter === "all" ? true : filter === "relevant" ? i.judgment !== "not_applicable" : i.judgment === filter,
  );
  const tabs: Array<{ key: typeof filter; label: string }> = [
    { key: "relevant", label: `関係あり ${issues.length - counts.not_applicable}` },
    { key: "affected", label: `問題あり ${counts.affected}` },
    { key: "watch", label: `監視 ${counts.watch}` },
    { key: "mitigated", label: `対策済み ${counts.mitigated}` },
    { key: "not_applicable", label: `非該当 ${counts.not_applicable}` },
    { key: "all", label: `すべて ${issues.length}` },
  ];

  return (
    <div className={`${glassPanel} p-5`}>
      <div className="flex flex-wrap items-center gap-6">
        <Donut
          segments={segments}
          center={counts.affected}
          sub="問題あり"
          size={132}
        />
        <div className="min-w-[12rem] flex-1">
          <p
            className={`text-base font-semibold ${
              report.worldIssuesSummary.level === "critical"
                ? "text-rose-100"
                : report.worldIssuesSummary.level === "warn"
                  ? "text-amber-100"
                  : "text-emerald-100"
            }`}
          >
            {report.worldIssuesSummary.text}
          </p>
          <div className="mt-3 max-w-xs">
            <Legend segments={segments} />
          </div>
        </div>
        <div className="w-full space-y-2 text-xs lg:w-auto lg:min-w-[20rem]">
          {meta.live ? (
            <p className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-cyan-50">
              毎日の自動取得：{formatJst(meta.fetchedAt, true)}（世界で {meta.scanned} 件を照合）
            </p>
          ) : (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-50">
              世界の最新リストをまだ取得していません。構成前提の固定判定のみ表示中（次回の日次診断から自動取得）。
            </p>
          )}
          {meta.sources.map((s) => (
            <div key={s.source} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-1.5">
              <span className="flex items-center gap-2 text-slate-300">
                <span className={`h-2 w-2 rounded-full ${s.ok ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-rose-500"}`} />
                {s.label}
              </span>
              <span className={s.ok ? "font-mono text-slate-200" : "text-rose-200"}>
                {s.ok ? `${s.count} 件・${formatJst(s.checkedAt)}` : (s.error ?? "取得失敗")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              filter === t.key
                ? "bg-gradient-to-r from-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/20"
                : "border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">この区分の項目はありません。</p>
      ) : (
        <div className="mt-4 grid max-h-[32rem] gap-3 overflow-auto pr-1 md:grid-cols-2">
          {visible.slice(0, 60).map((issue) => {
            const st = JUDGMENT_STYLE[issue.judgment];
            return (
              <div
                key={`${issue.origin ?? "x"}-${issue.id}`}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: st.color, boxShadow: `0 0 12px ${st.color}` }} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${st.chip}`}>{issue.judgmentLabel}</span>
                  {issue.originLabel && (
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-300">
                      {issue.originLabel}
                    </span>
                  )}
                  {issue.ransomware && (
                    <span className="rounded-full bg-rose-600/30 px-2 py-0.5 text-[10px] text-rose-100">
                      ランサムウェアで悪用
                    </span>
                  )}
                  {issue.publishedAt && <span className="text-[10px] text-slate-500">{issue.publishedAt}</span>}
                </div>
                <p className="mt-2 text-sm font-medium text-white">{issue.title}</p>
                {(issue.vendor || issue.product) && (
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {[issue.vendor, issue.product].filter(Boolean).join(" / ")} · {issue.id}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-300">{issue.reason}</p>
                <a
                  href={issue.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-[11px] text-cyan-300 hover:text-cyan-200"
                >
                  出典を開く →
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AutoBlockList({ blocks }: { blocks: SecurityAnalyticsReport["activeAutoBlocks"] }) {
  if (blocks == null) {
    return <p className="text-xs text-rose-300">自動ブロック一覧を取得できませんでした。</p>;
  }
  if (blocks.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        現在自動ブロック中の送信元はありません（10分間に繰り返し攻撃を検知すると全APIで1〜24時間遮断）。
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {blocks.slice(0, 12).map((b) => (
        <li
          key={`${b.lastBlockedAt}-${b.lastPath}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-xs"
        >
          <span className="text-white">{b.lastAttackLabel}</span>
          <span className="font-mono text-slate-400">{b.lastPath}</span>
          <span className="text-slate-300">
            {b.country ?? "不明"}・{b.blockCount}回目
          </span>
          <span className="text-rose-200">{formatJst(b.blockedUntil)} まで</span>
        </li>
      ))}
    </ul>
  );
}

export default function SecurityDefensePanels({ report }: { report: SecurityAnalyticsReport }) {
  const triage = report.latestTriage;
  const level = triage ? LEVEL_STYLE[triage.level] : null;
  const highOpen = triage ? triage.counts.critical + triage.counts.high : null;
  const daily = useMemo(() => fillMonthDays(report.month, report.byDay), [report.month, report.byDay]);
  const insights = report.attackInsights;
  const heatRows = insights.byCountry.slice(0, 6).map((c) => c.country);
  const heatCols = insights.byTarget.slice(0, 6).map((t) => ({ key: t.targetKind, label: t.targetLabel }));
  const flowValue = (country: string, target: string) =>
    insights.flows.find((f) => f.country === country && f.targetKind === target)?.count ?? 0;
  const maxCountry = Math.max(1, ...insights.byCountry.map((c) => c.count));
  const maxTarget = Math.max(1, ...insights.byTarget.map((t) => t.count));
  const maxType = Math.max(1, ...report.byType.map((t) => t.count));
  const worldAffected = report.worldIssues.filter((i) => i.judgment === "affected").length;

  return (
    <section className="space-y-10" aria-labelledby="security-defense-heading">
      {/* ヒーロー */}
      <div className={`${glassPanel} p-6`}>
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-rose-300/80">Security Defense</p>
        <h2 id="security-defense-heading" className="mt-2 text-2xl font-semibold tracking-tight text-white">
          外部攻撃・不正アクセスの防御状況
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          ① 構成 → ② 脆弱性と世界の重要問題 → ③ いま防御しているところ → ④ 環境・ソースの改善 の順に読めます。
          表示月：<span className="text-slate-200">{report.monthLabel}</span>（上部の月切替で過去月、診断は日付選択で過去日を表示）
        </p>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="日次診断" value={level?.label ?? "未実行"} tone={level?.tone ?? "warn"}>
            <p className="mt-1 text-[11px] text-slate-400">
              {triage ? `${formatJst(triage.generatedAt)} 実施` : "毎日自動実行"}
            </p>
          </StatTile>
          <StatTile
            label="未解決（重大・高）"
            value={highOpen ?? "—"}
            unit="件"
            tone={highOpen == null ? "warn" : highOpen > 0 ? "bad" : "good"}
          />
          <StatTile
            label="世界の重要問題・該当"
            value={worldAffected}
            unit={`/ ${report.worldIssues.length} 件`}
            tone={worldAffected > 0 ? "bad" : "good"}
          >
            <p className="mt-1 text-[11px] text-slate-400">
              {report.worldFeedMeta.live ? `${formatJst(report.worldFeedMeta.fetchedAt)} 取得` : "固定判定（未取得）"}
            </p>
          </StatTile>
          <StatTile
            label={`${report.monthLabel}の遮断`}
            value={report.summary.blockedEvents.toLocaleString("ja-JP")}
            unit="回"
            tone={report.summary.highSeverityEvents > 0 ? "warn" : "neutral"}
          >
            <p className="mt-1 text-[11px] text-slate-400">高重要度 {report.summary.highSeverityEvents} 回</p>
          </StatTile>
        </div>
      </div>

      {/* ① 構成 */}
      <div className="space-y-4">
        <SectionHeader
          step="1"
          title="いまの構成（守りの層）"
          subtitle="インターネットに近い順。どの層で何を止めているか"
          accent="from-cyan-400 to-sky-500"
        />
        <ArchitecturePipeline layers={report.architectureLayers} />
      </div>

      {/* ② 脆弱性 + 世界 */}
      <div className="space-y-5">
        <SectionHeader
          step="2"
          title="脆弱性対応と世界の重要問題"
          subtitle="毎日の診断で、世界の最新リストとこの環境の該当を照合"
          accent="from-violet-400 to-fuchsia-500"
        />
        <WorldIssuesPanel report={report} />
        <SecurityTriagePanel
          key={`${report.month}-${report.latestTriage?.generatedAt ?? "none"}`}
          triage={report.latestTriage}
          history={report.triageHistory}
          sectionTitle="この環境の脆弱性（日次診断）"
        />
      </div>

      {/* ③ 防御 */}
      <div className="space-y-5">
        <SectionHeader
          step="3"
          title={`いま防御しているところ（${report.monthLabel}）`}
          subtitle="どの国から・どこへ・どんな攻撃が来て・どう止めたか"
          accent="from-rose-400 to-orange-400"
        />

        <div className="grid gap-4 xl:grid-cols-3">
          <div className={`${glassPanel} p-5 xl:col-span-2`}>
            <p className="text-sm font-semibold text-white">日別の遮断件数</p>
            <AreaChart points={daily} />
          </div>
          <div className={`${glassPanel} p-5`}>
            <p className="text-sm font-semibold text-white">攻撃の読み取り</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {insights.narrative.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-slate-500">
              国・地域は Azure が付与した情報。IP は保存せず日次ハッシュ化しています。
            </p>
          </div>
        </div>

        <div className={`${glassPanel} p-5`}>
          <p className="text-sm font-semibold text-white">攻撃元 × 攻撃場所（ヒートマップ）</p>
          <p className="mb-3 text-xs text-slate-500">色が濃いほど件数が多い組み合わせです。</p>
          {heatRows.length === 0 ? (
            <p className="text-sm text-slate-500">この月の攻撃記録はありません。</p>
          ) : (
            <Heatmap rows={heatRows} cols={heatCols} value={flowValue} />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className={`${glassPanel} space-y-3 p-5`}>
            <p className="text-sm font-semibold text-white">攻撃元（国・地域）</p>
            {insights.byCountry.length === 0 ? (
              <p className="text-sm text-slate-500">記録なし</p>
            ) : (
              insights.byCountry.map((c) => (
                <HBar key={c.country} label={c.country} value={c.count} max={maxCountry} gradient="from-orange-500 to-amber-300" />
              ))
            )}
          </div>
          <div className={`${glassPanel} space-y-3 p-5`}>
            <p className="text-sm font-semibold text-white">狙われた場所（機能別）</p>
            {insights.byTarget.length === 0 ? (
              <p className="text-sm text-slate-500">記録なし</p>
            ) : (
              insights.byTarget.map((t) => (
                <HBar key={t.targetKind} label={t.targetLabel} value={t.count} max={maxTarget} gradient="from-fuchsia-500 to-rose-400" />
              ))
            )}
          </div>
          <div className={`${glassPanel} space-y-3 p-5`}>
            <p className="text-sm font-semibold text-white">攻撃の種類と止め方</p>
            {report.byType.length === 0 ? (
              <p className="text-sm text-slate-500">記録なし</p>
            ) : (
              report.byType.map((t) => (
                <HBar
                  key={t.eventType}
                  label={t.label}
                  value={t.count}
                  max={maxType}
                  gradient="from-rose-500 to-pink-400"
                  hint={t.mitigation}
                />
              ))
            )}
          </div>
        </div>

        <div className={`${glassPanel} p-5`}>
          <p className="mb-3 text-sm font-semibold text-white">
            自動ブロック中の送信元{report.activeAutoBlocks ? ` ${report.activeAutoBlocks.length} 件` : ""}
          </p>
          <AutoBlockList blocks={report.activeAutoBlocks} />
        </div>

        <div className={`${glassPanel}`}>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-sm font-semibold text-white">防御記録の明細（{report.monthLabel}）</p>
            <p className="mt-1 text-xs text-slate-500">{report.coverageNote}</p>
          </div>
          {report.recentEvents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">防御記録はありません。</p>
          ) : (
            <div className="max-h-[30rem] overflow-auto">
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
                        <p className="text-slate-300">{formatJst(event.createdAt)}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${severityClass(event.severity)}`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        <p>
                          {event.country} / {event.region}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-500">{event.sourceHash}</p>
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
    </section>
  );
}
