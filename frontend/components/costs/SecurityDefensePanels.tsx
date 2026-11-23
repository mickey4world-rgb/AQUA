"use client";

import { useMemo, useState } from "react";
import SecurityTriagePanel from "@/components/costs/SecurityTriagePanel";
import SecurityStatusChatPanel from "@/components/costs/SecurityStatusChatPanel";
import AttackWorldMap from "@/components/costs/security/AttackWorldMap";
import { countryNameJa } from "@/lib/security-attack-insights";
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
import {
  isWorldBuzzIssue,
  worldIssueOpenUrl,
} from "@/lib/security-world-issues";
import type { SecurityAnalyticsReport } from "@/lib/types/analytics";

type Judgment = SecurityAnalyticsReport["worldIssues"][number]["judgment"];
type WorldIssue = SecurityAnalyticsReport["worldIssues"][number];

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

function ArchitecturePipeline({
  layers,
  stack,
}: {
  layers: SecurityAnalyticsReport["architectureLayers"];
  stack: SecurityAnalyticsReport["stackInventory"];
}) {
  const accents = [
    "from-cyan-400 to-sky-500",
    "from-violet-400 to-fuchsia-500",
    "from-rose-400 to-orange-400",
    "from-emerald-400 to-teal-500",
  ];
  return (
    <div className="space-y-4">
      <div className={`${glassPanel} px-5 py-4`}>
        <p className="text-sm font-semibold text-white">利用している部品（いまの版）</p>
        <p className="mt-1 text-xs text-slate-300">{stack.summary}</p>
        <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
          {stack.clarifications.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-cyan-400/0 via-fuchsia-400/50 to-emerald-400/0 xl:block" />
        {layers.map((layer, i) => (
          <div key={layer.id} className={`${glassPanel} p-4`}>
            <div className="flex items-center gap-3">
              <span
                className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[i % accents.length]} font-mono text-lg font-bold text-slate-950 shadow-lg`}
              >
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {layer.title.replace(/^[①②③④]\s*/, "")}
                </p>
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
            {(layer.components?.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  部品
                </p>
                <ul className="mt-1.5 space-y-2">
                  {layer.components.map((c) => (
                    <li key={`${layer.id}-${c.name}`} className="text-xs">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span
                          className={
                            c.inUse ? "font-medium text-white" : "font-medium text-slate-400"
                          }
                        >
                          {c.name}
                        </span>
                        {c.version && (
                          <span className="font-mono text-[10px] text-cyan-200/80">
                            v{c.version}
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] ${
                            c.inUse
                              ? "bg-emerald-500/15 text-emerald-100"
                              : "bg-amber-500/10 text-amber-100/80"
                          }`}
                        >
                          {c.inUse ? c.kindLabel : `${c.kindLabel}・枠組みではない`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{c.role}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorldIssueCard({ issue, emphasize }: { issue: WorldIssue; emphasize?: boolean }) {
  const st = JUDGMENT_STYLE[issue.judgment];
  const openUrl = worldIssueOpenUrl(issue);
  const titleClass = emphasize
    ? "mt-2 text-sm font-semibold text-white"
    : "mt-2 text-sm font-medium text-white";
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 ${
        emphasize
          ? "border-rose-400/35 bg-gradient-to-br from-rose-500/15 to-fuchsia-500/5"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: st.color, boxShadow: `0 0 12px ${st.color}` }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {emphasize && (
          <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-[10px] font-semibold text-rose-50">
            世界で注目
          </span>
        )}
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${st.chip}`}>
          {issue.judgmentLabel}
        </span>
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
        {issue.severity === "critical" && (
          <span className="rounded-full bg-orange-500/25 px-2 py-0.5 text-[10px] text-orange-100">
            重大
          </span>
        )}
        {issue.publishedAt && (
          <span className="text-[10px] text-slate-500">{issue.publishedAt}</span>
        )}
      </div>
      {openUrl ? (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${titleClass} underline-offset-2 hover:text-cyan-200 hover:underline`}
        >
          {issue.title}
        </a>
      ) : (
        <p className={titleClass}>{issue.title}</p>
      )}
      {(issue.vendor || issue.product || issue.id) && (
        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
          {[issue.vendor, issue.product].filter(Boolean).join(" / ") || issue.id}
          {issue.vendor || issue.product ? ` · ${issue.id}` : ""}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-300">{issue.reason}</p>
      {openUrl ? (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-3 py-1 text-[11px] font-medium text-cyan-50 hover:bg-cyan-500/25"
        >
          公式の説明を開く →
        </a>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">公式リンクは未設定です。</p>
      )}
    </div>
  );
}

function WorldIssuesPanel({ report }: { report: SecurityAnalyticsReport }) {
  const [filter, setFilter] = useState<Judgment | "relevant" | "buzz" | "all">("buzz");
  const issues = report.worldIssues;
  const counts: Record<Judgment, number> = { affected: 0, watch: 0, mitigated: 0, not_applicable: 0 };
  for (const i of issues) counts[i.judgment] += 1;
  const buzzIssues = issues.filter((i) => isWorldBuzzIssue(i));
  const segments: DonutSegment[] = (Object.keys(counts) as Judgment[]).map((k) => ({
    label: JUDGMENT_STYLE[k].short,
    value: counts[k],
    color: JUDGMENT_STYLE[k].color,
  }));
  const meta = report.worldFeedMeta;
  const visible = issues.filter((i) =>
    filter === "all"
      ? true
      : filter === "buzz"
        ? isWorldBuzzIssue(i)
        : filter === "relevant"
          ? i.judgment !== "not_applicable"
          : i.judgment === filter,
  );
  const tabs: Array<{ key: typeof filter; label: string }> = [
    { key: "buzz", label: `世界で注目 ${buzzIssues.length}` },
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
          <p className="mt-2 text-xs text-slate-400">
            「世界で注目」は悪用確認（CISA KEV）・重大・ランサム関連です。この環境の該当／非該当に関係なく、タイトルまたはボタンから公式説明を開けます。
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

      {buzzIssues.length > 0 && (
        <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-500/5 p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-rose-50">今、世界で騒がれている危険</p>
              <p className="mt-0.5 text-[11px] text-rose-100/70">
                クリックで公式ページ（CISA / NVD / Advisory など）が開きます。非該当でも中身を読めます。
              </p>
            </div>
            <p className="font-mono text-xs text-rose-100/80">{buzzIssues.length} 件</p>
          </div>
          <div className="mt-3 grid max-h-[22rem] gap-3 overflow-auto pr-1 md:grid-cols-2">
            {buzzIssues.slice(0, 8).map((issue) => (
              <WorldIssueCard
                key={`buzz-${issue.origin ?? "x"}-${issue.id}`}
                issue={issue}
                emphasize
              />
            ))}
          </div>
        </div>
      )}

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
          {visible.slice(0, 60).map((issue) => (
            <WorldIssueCard
              key={`${issue.origin ?? "x"}-${issue.id}`}
              issue={issue}
              emphasize={isWorldBuzzIssue(issue)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Decision = {
  tone: "bad" | "warn";
  title: string;
  detail: string;
  href?: string | null;
  hrefLabel?: string;
};

function buildDecisions(report: SecurityAnalyticsReport): Decision[] {
  const out: Decision[] = [];
  const t = report.latestTriage;
  if (!t) {
    out.push({ tone: "warn", title: "日次診断がまだありません", detail: "毎朝 1 時の自動診断の結果を待っています。" });
  } else {
    if (t.ageHours > 36) {
      out.push({ tone: "bad", title: `診断が ${t.ageHours} 時間更新されていません`, detail: "自動診断の停止を疑ってください。" });
    }
    for (const a of t.actions.filter((x) => x.priority !== "week").slice(0, 3)) {
      const matched = t.issues.find(
        (i) =>
          a.title.includes(i.title) ||
          (i.packageName != null && a.title.includes(i.packageName)),
      );
      const href = matched?.url && /^https:\/\//i.test(matched.url) ? matched.url : null;
      out.push({
        tone: a.priority === "now" ? "bad" : "warn",
        title: a.title,
        detail: a.detail,
        href,
        hrefLabel: href ? "詳細を開く" : undefined,
      });
    }
    const missing = t.collections.filter((c) => !c.ok && !c.optional);
    if (missing.length > 0) {
      out.push({
        tone: "warn",
        title: `取得できなかった情報源 ${missing.length} 件`,
        detail: "この日の「問題なし」は一部の確認が欠けています。",
      });
    }
  }
  const affected = report.worldIssues.filter((i) => i.judgment === "affected");
  if (affected.length > 0) {
    const firstUrl = worldIssueOpenUrl(affected[0]!);
    out.push({
      tone: "bad",
      title: `世界の重要問題がこの環境に該当 ${affected.length} 件`,
      detail: affected.slice(0, 2).map((i) => i.title).join(" / "),
      href: firstUrl,
      hrefLabel: firstUrl ? "最初の該当を公式で開く" : undefined,
    });
  }
  const buzz = report.worldIssues.filter((i) => isWorldBuzzIssue(i));
  if (buzz.length > 0 && affected.length === 0) {
    const firstUrl = worldIssueOpenUrl(buzz[0]!);
    out.push({
      tone: "warn",
      title: `世界で注目の危険 ${buzz.length} 件（この環境は非該当または監視）`,
      detail: buzz.slice(0, 2).map((i) => i.title).join(" / "),
      href: firstUrl,
      hrefLabel: firstUrl ? "話題の内容を公式で開く" : undefined,
    });
  }
  const brute = report.suspiciousSources.filter((s) => s.pattern === "brute_force");
  if (brute.length > 0) {
    out.push({
      tone: "warn",
      title: `総当たりログインの疑い ${brute.length} 送信元`,
      detail: "自動ブロックが働いているかを下の一覧で確認できます。",
    });
  }
  return out;
}

function DecisionStrip({ report }: { report: SecurityAnalyticsReport }) {
  const items = buildDecisions(report);
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 to-cyan-500/5 px-5 py-4">
        <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
        <div>
          <p className="text-sm font-semibold text-emerald-50">今、判断が必要なことはありません</p>
          <p className="text-xs text-emerald-100/70">診断・世界の重要問題・攻撃の集中のいずれも対応不要です。</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">今、判断すべきこと</p>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((d) => (
          <li
            key={d.title}
            className={`rounded-xl border px-4 py-3 ${
              d.tone === "bad"
                ? "border-rose-400/40 bg-rose-500/10"
                : "border-amber-400/30 bg-amber-500/10"
            }`}
          >
            <p className={`text-sm font-semibold ${d.tone === "bad" ? "text-rose-50" : "text-amber-50"}`}>{d.title}</p>
            <p className="mt-0.5 text-xs text-slate-300">{d.detail}</p>
            {d.href && (
              <a
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-[11px] font-medium text-cyan-300 hover:text-cyan-200"
              >
                {d.hrefLabel ?? "公式の説明を開く"} →
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TYPE_ACCENT: Record<string, string> = {
  auth_denied: "from-violet-500 to-fuchsia-500",
  automation_auth_denied: "from-fuchsia-500 to-pink-500",
  rate_limited: "from-amber-400 to-orange-500",
  invalid_request: "from-sky-400 to-cyan-500",
  auto_blocked: "from-rose-500 to-red-600",
};

function SuspiciousList({ sources }: { sources: SecurityAnalyticsReport["suspiciousSources"] }) {
  if (sources.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        同じ送信元から 5 回以上の集中はありません（散発的な遮断のみ）。
      </p>
    );
  }
  const max = Math.max(1, ...sources.map((s) => s.count));
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.sourceHash} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  s.pattern === "brute_force"
                    ? "bg-rose-500/25 text-rose-100"
                    : s.pattern === "scan"
                      ? "bg-amber-500/20 text-amber-100"
                      : "bg-sky-500/20 text-sky-100"
                }`}
              >
                {s.patternLabel}
              </span>
              <span className="text-sm text-white">{s.country}</span>
            </span>
            <span className="font-mono text-sm text-rose-100">{s.count} 回</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-300"
              style={{ width: `${(s.count / max) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {s.topLabel}・対象 {s.distinctPaths} 箇所・{formatJst(s.firstAt)} 〜 {formatJst(s.lastAt)}
            <span className="ml-2 font-mono text-slate-600">{s.sourceHash.slice(0, 12)}</span>
          </p>
        </li>
      ))}
    </ul>
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
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const detail = typeFilter ? report.byTypeDetail.find((d) => d.eventType === typeFilter) : null;
  const daily = useMemo(
    () => fillMonthDays(report.month, detail ? detail.byDay : report.byDay),
    [report.month, report.byDay, detail],
  );
  const insights = detail ? detail.insights : report.attackInsights;
  const filteredEvents = typeFilter
    ? report.recentEvents.filter((e) => e.eventType === typeFilter)
    : report.recentEvents;
  const filterLabel = typeFilter
    ? (report.byType.find((t) => t.eventType === typeFilter)?.label ?? typeFilter)
    : null;
  const coverage = report.countryCoverage;
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
            <p className="mt-1 text-[11px] text-slate-400">
              高重要度 {report.summary.highSeverityEvents} 回
              {report.summary.blockedEvents <= 1
                ? " · 承認済みの防御テストを含む場合があります"
                : ""}
            </p>
          </StatTile>
        </div>
        <div className="relative mt-5">
          <DecisionStrip report={report} />
        </div>
      </div>

      <SecurityStatusChatPanel month={report.month} />

      {/* ① 構成 */}
      <div className="space-y-4">
        <SectionHeader
          step="1"
          title="いまの構成（守りの層）"
          subtitle="インターネットに近い順。どの層で何を止めているか。Next.js など実際の部品と版もここに出ます"
          accent="from-cyan-400 to-sky-500"
        />
        <ArchitecturePipeline
          layers={report.architectureLayers}
          stack={
            report.stackInventory ?? {
              generatedAt: "",
              nodeMajor: null,
              summary: "部品情報は次の再取得で表示されます",
              clarifications: [],
            }
          }
        />
      </div>

      {/* ② 脆弱性 + 世界 */}
      <div className="space-y-5">
        <SectionHeader
          step="2"
          title="脆弱性対応と世界の重要問題"
          subtitle="世界で騒がれている危険はリンクで公式説明を開けます。あわせてこの環境への該当も毎日照合"
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

        <div>
          <p className="mb-2 text-xs text-slate-400">
            攻撃の種類（クリックで下のグラフ・地図・明細をその種類だけに絞り込み）
          </p>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className={`rounded-2xl border p-4 text-left transition ${
                typeFilter == null
                  ? "border-white/40 bg-white/[0.08] shadow-lg shadow-white/5"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <p className="text-[11px] text-slate-400">すべて</p>
              <p className="mt-1 font-mono text-2xl text-white">{report.summary.blockedEvents}</p>
            </button>
            {report.byType.map((t) => (
              <button
                key={t.eventType}
                type="button"
                onClick={() => setTypeFilter(typeFilter === t.eventType ? null : t.eventType)}
                className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                  typeFilter === t.eventType
                    ? "border-white/40 bg-white/[0.08] shadow-lg"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${TYPE_ACCENT[t.eventType] ?? "from-slate-400 to-slate-600"}`}
                />
                <p className="text-[11px] text-slate-400">{t.label}</p>
                <p className="mt-1 font-mono text-2xl text-white">{t.count}</p>
              </button>
            ))}
          </div>
          {filterLabel && (
            <p className="mt-2 text-xs text-cyan-200">
              絞り込み中：{filterLabel}
              <button type="button" onClick={() => setTypeFilter(null)} className="ml-2 underline">
                解除
              </button>
            </p>
          )}
        </div>

        <div className={`${glassPanel} p-5`}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">攻撃元の世界地図</p>
              <p className="text-xs text-slate-500">どの国から AQUA（日本）へ攻撃が来ているか</p>
            </div>
            <p className="text-[11px] text-slate-400">
              国判定済み {coverage.known}/{coverage.total} 件 ・ {coverage.note}
            </p>
          </div>
          <AttackWorldMap countries={insights.byCountry} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className={`${glassPanel} p-5 xl:col-span-2`}>
            <p className="text-sm font-semibold text-white">日別の遮断件数{filterLabel ? `（${filterLabel}）` : ""}</p>
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
              国は IP から同梱の表で判定し、IP 自体は保存せず日次ハッシュ化しています。
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

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${glassPanel} p-5`}>
            <p className="text-sm font-semibold text-white">要注意の送信元（集中した攻撃）</p>
            <p className="mb-3 text-xs text-slate-500">
              同じ送信元から 5 回以上。総当たり・探索・連打を自動で見分けます（この月・全種類）。
            </p>
            <SuspiciousList sources={report.suspiciousSources} />
          </div>
          <div className={`${glassPanel} p-5`}>
            <p className="mb-3 text-sm font-semibold text-white">
              自動ブロック中の送信元{report.activeAutoBlocks ? ` ${report.activeAutoBlocks.length} 件` : ""}
            </p>
            <AutoBlockList blocks={report.activeAutoBlocks} />
          </div>
        </div>

        <div className={`${glassPanel}`}>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-sm font-semibold text-white">
              防御記録の明細（{report.monthLabel}{filterLabel ? `・${filterLabel}` : ""}）
            </p>
            <p className="mt-1 text-xs text-slate-500">{report.coverageNote}</p>
          </div>
          {filteredEvents.length === 0 ? (
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
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="align-top hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <p className="text-slate-300">{formatJst(event.createdAt)}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${severityClass(event.severity)}`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        <p>
                          {countryNameJa(event.country === "不明" ? null : event.country)}
                          {event.region && event.region !== "不明" ? ` / ${event.region}` : ""}
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
