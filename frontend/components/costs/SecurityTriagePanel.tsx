"use client";

import { useState } from "react";
import {
  SectionHeader,
  glassPanel as costsPanelClass,
} from "@/components/costs/security/SecurityVisuals";
import type { SecurityAnalyticsReport } from "@/lib/types/analytics";

type Triage = NonNullable<SecurityAnalyticsReport["latestTriage"]>;

const TRIAGE_STALE_HOURS = 36;

const LEVEL = {
  ok: {
    label: "問題なし",
    note: "未解決の重大・高はなく、必要な情報源をすべて確認できました。",
    banner: "border-emerald-400/30 bg-emerald-500/10 text-emerald-50",
    dot: "bg-emerald-400",
  },
  warn: {
    label: "要確認",
    note: "すぐに危険ではありませんが、確認・対処が必要な項目があります。",
    banner: "border-amber-400/30 bg-amber-500/10 text-amber-50",
    dot: "bg-amber-400",
  },
  critical: {
    label: "至急対応",
    note: "修正できるのに放置されている重大な問題、または秘密情報の漏えいがあります。",
    banner: "border-rose-400/40 bg-rose-500/15 text-rose-50",
    dot: "bg-rose-500",
  },
} as const;

const SEVERITY = {
  critical: { label: "重大", className: "bg-rose-500/25 text-rose-100" },
  high: { label: "高", className: "bg-orange-500/20 text-orange-100" },
  medium: { label: "中", className: "bg-amber-500/15 text-amber-100" },
  low: { label: "低", className: "bg-sky-500/15 text-sky-100" },
  unknown: { label: "不明", className: "bg-slate-500/20 text-slate-200" },
} as const;

const SOURCE_LABEL: Record<string, string> = {
  "npm-audit": "依存パッケージ（npm audit）",
  dependabot: "Dependabot アラート",
  "code-scanning": "コード解析（CodeQL）",
  "secret-scanning": "秘密情報の検出",
  "security-events": "防御履歴（直近24時間）",
  autoblock: "自動ブロック一覧",
  "platform-runtime": "ホスト制約（SWA Node など）",
  "world-feed": "世界の重要問題（CISA KEV・Node.js・GitHub Advisory）",
};

const SEVERITY_BAR: Array<{ key: "critical" | "high" | "medium" | "low" | "unknown"; color: string }> = [
  { key: "critical", color: "#f43f5e" },
  { key: "high", color: "#fb923c" },
  { key: "medium", color: "#fbbf24" },
  { key: "low", color: "#38bdf8" },
  { key: "unknown", color: "#64748b" },
];

function SeverityBar({ counts }: { counts: Triage["counts"] }) {
  const total = SEVERITY_BAR.reduce((s, x) => s + counts[x.key], 0);
  return (
    <div className={`${costsPanelClass} p-4`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white">検出された脆弱性の重要度</span>
        <span className="font-mono text-slate-300">合計 {total} 件</span>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
        {total > 0 &&
          SEVERITY_BAR.filter((x) => counts[x.key] > 0).map((x) => (
            <div
              key={x.key}
              title={`${SEVERITY[x.key].label}: ${counts[x.key]}`}
              style={{ width: `${(counts[x.key] / total) * 100}%`, background: x.color, boxShadow: `0 0 10px ${x.color}88` }}
            />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
        {SEVERITY_BAR.map((x) => (
          <span key={x.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
            {SEVERITY[x.key].label} <span className="font-mono text-slate-200">{counts[x.key]}</span>
          </span>
        ))}
      </div>
      {total === 0 && <p className="mt-2 text-xs text-emerald-200">未解決の脆弱性はありません。</p>}
    </div>
  );
}

function SourceRow({ c, fallbackAt }: { c: Triage["collections"][number]; fallbackAt: string }) {
  const at = c.checkedAt ?? fallbackAt;
  const alt = c.alternative;
  const altOk = alt?.ok === true;
  const status = c.ok
    ? { dot: "bg-emerald-400 shadow-[0_0_6px_#34d399]", text: `確認済み（${c.count} 件）`, cls: "text-emerald-200" }
    : c.optional && altOk
      ? { dot: "bg-cyan-400 shadow-[0_0_6px_#22d3ee]", text: "代替で確認済み", cls: "text-cyan-200" }
      : c.optional && alt
        ? { dot: "bg-amber-400", text: "代替で要確認", cls: "text-amber-200" }
        : c.optional
          ? { dot: "bg-slate-500", text: "未接続（代替の記録なし）", cls: "text-slate-400" }
          : { dot: "bg-rose-500", text: c.error ?? "取得失敗", cls: "text-rose-200" };
  return (
    <li className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-slate-200">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
          {SOURCE_LABEL[c.source] ?? c.source}
          {c.optional && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">任意</span>
          )}
        </span>
        <span className="text-right">
          <span className={`block text-xs ${status.cls}`}>{status.text}</span>
          <span className="block font-mono text-[10px] text-slate-500">{formatJst(at)} 確認</span>
        </span>
      </div>
      {c.optional && !c.ok && (
        <div className="ml-4 mt-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px]">
          <p className="text-slate-400">本体: {c.error ?? "未接続"}</p>
          {alt ? (
            <>
              <p className={`mt-1 ${altOk ? "text-cyan-100" : "text-amber-100"}`}>
                代替: {alt.label} — {altOk ? "問題なし" : `${alt.count} 件`}
                <span className="ml-1 font-mono text-slate-500">（{formatJst(alt.checkedAt ?? at)} 確認）</span>
              </p>
              {alt.detail && <p className="mt-0.5 text-slate-500">{alt.detail}</p>}
            </>
          ) : (
            <p className="mt-1 text-slate-500">この日の診断には代替確認の記録がありません（次回の診断から記録）。</p>
          )}
        </div>
      )}
    </li>
  );
}

const ISSUE_SOURCE_LABEL: Record<string, string> = {
  "npm-audit": "依存パッケージ",
  dependabot: "依存パッケージ",
  "code-scanning": "コード",
  "secret-scanning": "秘密情報",
  "platform-runtime": "ホスト",
};

const PRIORITY = {
  now: { label: "至急", className: "bg-rose-500/25 text-rose-100" },
  today: { label: "本日中", className: "bg-amber-500/20 text-amber-100" },
  week: { label: "今週", className: "bg-sky-500/15 text-sky-100" },
} as const;

function formatJst(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function formatAge(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 24) return `${hours}時間`;
  return `${Math.floor(hours / 24)}日`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" }) {
  const color = tone === "bad" ? "text-rose-200" : tone === "warn" ? "text-amber-200" : "text-white";
  return (
    <div className={`${costsPanelClass} px-4 py-3`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-xl ${color}`}>{value}</p>
    </div>
  );
}

function HistoryDots({
  history,
  selected,
  onSelect,
}: {
  history: SecurityAnalyticsReport["triageHistory"];
  selected: string | null;
  onSelect: (dateJst: string) => void;
}) {
  if (!history || history.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="診断履歴（クリックで過去を表示）">
      <span className="mr-1 text-[11px] text-slate-400">履歴{history.length}日:</span>
      {history.map((day) => {
        const active = selected === day.dateJst;
        return (
          <button
            key={day.dateJst}
            type="button"
            title={`${day.dateJst} ${LEVEL[day.level].label}${day.aiStatus === "failed" ? "（AI要約なし）" : ""} — クリックで表示`}
            onClick={() => onSelect(day.dateJst)}
            className={`h-3.5 w-3.5 rounded-sm transition ring-offset-1 ring-offset-slate-950 ${LEVEL[day.level].dot} ${
              active ? "ring-2 ring-white" : "hover:opacity-80"
            }`}
          />
        );
      })}
    </div>
  );
}

function ModelPanel({ selection, usedModel }: { selection: Triage["modelSelection"]; usedModel: string | null }) {
  if (!selection) {
    return <p className="px-5 py-4 text-sm text-slate-500">モデルの自動選定はまだ実行されていません。</p>;
  }
  return (
    <div className="px-5 py-4 text-sm">
      <p className="text-slate-200">
        使用中: <span className="font-mono text-white">{selection.selected ?? "なし"}</span>
        {selection.resolvedVersion && selection.resolvedVersion !== selection.selected && (
          <span className="ml-1 text-xs text-slate-400">（実体: {selection.resolvedVersion}）</span>
        )}
      </p>
      {usedModel && usedModel !== selection.selected && (
        <p className="mt-1 text-xs text-amber-200">本日の要約は予備モデル {usedModel} で作成しました。</p>
      )}
      <p className="mt-1 text-xs text-slate-400">
        最終確認 {formatJst(selection.checkedAt)}
        {selection.previous
          ? ` ／ ${formatJst(selection.switchedAt)} に ${selection.previous} から自動切替`
          : ""}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 pr-4 font-medium">候補モデル</th>
              <th className="py-1 pr-4 font-medium">結果</th>
              <th className="py-1 font-medium">応答</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {selection.probes.map((p) => (
              <tr key={p.model}>
                <td className="py-1.5 pr-4 font-mono text-slate-200">
                  {p.model}
                  {p.model === selection.selected && <span className="ml-1 text-emerald-300">← 採用</span>}
                </td>
                <td className="py-1.5 pr-4">
                  {p.ok ? (
                    <span className="text-emerald-300">無料枠で利用可</span>
                  ) : (
                    <span className="text-slate-500" title={p.reason ?? undefined}>
                      利用不可（未公開・無料枠外など）
                    </span>
                  )}
                </td>
                <td className="py-1.5 font-mono text-slate-400">{(p.latencyMs / 1000).toFixed(1)}秒</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        毎朝、次の版を含む候補を短く試し、無料枠で応答した中で最も新しい Flash モデルに自動で切り替えます。有料のみのモデルは応答しないため選ばれません。
      </p>
    </div>
  );
}

export default function SecurityTriagePanel({
  triage: initialTriage,
  history,
  sectionTitle = "AI セキュリティ診断（毎朝 1 時）",
}: {
  triage: SecurityAnalyticsReport["latestTriage"];
  history: SecurityAnalyticsReport["triageHistory"];
  sectionTitle?: string;
}) {
  const [triage, setTriage] = useState(initialTriage);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialTriage?.dateJst ?? null,
  );
  const [loadingDate, setLoadingDate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const viewingPast =
    Boolean(initialTriage && triage && triage.dateJst !== initialTriage.dateJst);

  async function loadHistoryDate(dateJst: string) {
    if (!dateJst) return;
    if (initialTriage?.dateJst === dateJst) {
      setTriage(initialTriage);
      setSelectedDate(dateJst);
      setLoadError(null);
      return;
    }
    setLoadingDate(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/costs/security-triage?dateJst=${encodeURIComponent(dateJst)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `${dateJst} の診断を取得できませんでした`);
      }
      const body = (await res.json()) as { triage: Triage };
      setTriage(body.triage);
      setSelectedDate(dateJst);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "履歴の取得に失敗しました");
    } finally {
      setLoadingDate(false);
    }
  }

  if (!triage) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
        AI セキュリティ診断の結果がまだありません（毎朝 1 時に自動実行）。
        {history && history.length > 0 && (
          <div className="mt-3">
            <HistoryDots
              history={history}
              selected={selectedDate}
              onSelect={(d) => void loadHistoryDate(d)}
            />
          </div>
        )}
      </div>
    );
  }

  const level = LEVEL[triage.level];
  const stale = !viewingPast && triage.ageHours > TRIAGE_STALE_HOURS;
  const highOpen = triage.counts.critical + triage.counts.high;
  const overdue = triage.issues.filter((i) => i.overdue).length;
  const applied = triage.appliedAutoPatches ?? [];
  const waiting = triage.openSecurityPrs ?? [];
  const required = triage.collections.filter((c) => !c.optional);
  const optional = triage.collections.filter((c) => c.optional);
  const requiredOk = required.filter((c) => c.ok).length;
  const kindLabel = (kind?: string) => (kind === "platform" ? "ホスト" : "依存パッケージ");

  return (
    <section className="space-y-4" aria-labelledby="security-triage-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 id="security-triage-heading" className="text-lg font-semibold text-white">
          {sectionTitle}
        </h3>
        <HistoryDots
          history={history}
          selected={selectedDate}
          onSelect={(d) => void loadHistoryDate(d)}
        />
      </div>

      {history && history.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <label htmlFor="triage-history-date" className="shrink-0">
            過去の診断日
          </label>
          <select
            id="triage-history-date"
            className="rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200"
            value={selectedDate ?? triage.dateJst}
            disabled={loadingDate}
            onChange={(e) => void loadHistoryDate(e.target.value)}
          >
            {[...history].reverse().map((day) => (
              <option key={day.dateJst} value={day.dateJst}>
                {day.dateJst}（{LEVEL[day.level].label}
                {day.aiStatus === "failed" ? "・AIなし" : ""}）
              </option>
            ))}
          </select>
          {loadingDate && <span className="text-amber-200">読み込み中…</span>}
          {viewingPast && initialTriage && (
            <button
              type="button"
              className="rounded border border-white/15 px-2 py-1 text-cyan-200 hover:bg-white/5"
              onClick={() => void loadHistoryDate(initialTriage.dateJst)}
            >
              最新（{initialTriage.dateJst}）に戻る
            </button>
          )}
        </div>
      )}
      {loadError && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {loadError}
        </p>
      )}
      {viewingPast && (
        <p className="rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          {triage.dateJst} 時点の診断を表示しています（履歴閲覧）。自動パッチ件数もその日のスナップショットです。
        </p>
      )}
      {Array.isArray(triage.worldIssues) && triage.worldIssues.length > 0 && viewingPast && (
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">
              その日の世界重要問題判定 {triage.worldIssues.length} 件
            </h4>
          </div>
          <ul className="divide-y divide-white/5 text-sm">
            {triage.worldIssues.map((issue) => (
              <li key={issue.id} className="px-5 py-3">
                <p className="text-xs text-slate-400">{issue.judgmentLabel}</p>
                <p className="text-slate-200">{issue.title}</p>
                <p className="mt-1 text-xs text-slate-500">{issue.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`rounded-2xl border px-5 py-4 ${level.banner}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-semibold">{level.label}</span>
          <span className="text-xs opacity-80">
            {formatJst(triage.generatedAt)} 診断（{triage.dateJst}・毎日自動、1時予定／GitHub の混雑で数時間遅れても朝までに完了）
          </span>
          {triage.aiStatus === "failed" && (
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px]">
              AI 要約なし・ルール判定のみ
            </span>
          )}
        </div>
        <p className="mt-1 text-xs opacity-75">{level.note}</p>
        {stale && (
          <p className="mt-2 rounded-lg bg-rose-500/25 px-3 py-2 text-sm">
            診断が {triage.ageHours} 時間更新されていません。下の結果は古い可能性があります。
          </p>
        )}
        <p className="mt-3 text-base font-semibold">{triage.headline}</p>
        <p className="mt-1 text-sm opacity-90">{triage.summary}</p>
        {triage.aiStatus === "failed" && triage.aiReason && (
          <p className="mt-2 text-xs opacity-70">AI 要約の失敗理由: {triage.aiReason}</p>
        )}
      </div>

      <SeverityBar counts={triage.counts} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="未解決（重大・高）" value={`${highOpen} 件`} tone={highOpen > 0 ? "warn" : undefined} />
        <Stat label="24時間超の放置" value={`${overdue} 件`} tone={overdue > 0 ? "bad" : undefined} />
        <Stat label="自動適用（直近14日）" value={`${applied.length} 件`} />
        <Stat
          label="自動パッチ待ち"
          value={`${waiting.length} 件`}
          tone={waiting.length > 0 ? "warn" : undefined}
        />
        <Stat
          label="直近24時間の防御（自動ブロック）"
          value={triage.events ? `${triage.events.total} 件（${triage.events.autoBlocked}）` : "取得失敗"}
          tone={triage.events == null ? "bad" : triage.events.autoBlocked > 0 ? "warn" : undefined}
        />
      </div>

      {triage.actions.length > 0 && (
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">やること</h4>
          </div>
          <ul className="divide-y divide-white/5">
            {triage.actions.map((action) => (
              <li key={`${action.priority}-${action.title}`} className="px-5 py-3 text-sm">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] ${PRIORITY[action.priority].className}`}>
                  {PRIORITY[action.priority].label}
                </span>
                <span className="text-white">{action.title}</span>
                <p className="mt-1 text-xs text-slate-400">{action.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`${costsPanelClass} overflow-hidden`}>
        <div className="border-b border-white/10 px-5 py-3">
          <h4 className="text-sm font-semibold text-white">未解決の項目 {triage.issues.length} 件</h4>
          <p className="mt-1 text-xs text-slate-500">
            重大・高はすべて、中程度は 7 日以上放置されたものを表示します。修正版がある重大・高は自動パッチで 24 時間以内に適用されるはずです。
          </p>
        </div>
        {triage.issues.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">未解決の項目はありません。</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-950/95 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">重要度</th>
                  <th className="px-3 py-2 font-medium">種類</th>
                  <th className="px-3 py-2 font-medium">内容</th>
                  <th className="px-3 py-2 font-medium">経過</th>
                  <th className="px-5 py-2 font-medium">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {triage.issues.map((issue, index) => (
                  <tr key={`${issue.source}-${issue.title}-${index}`} className="align-top">
                    <td className="px-5 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${SEVERITY[issue.severity].className}`}>
                        {SEVERITY[issue.severity].label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{ISSUE_SOURCE_LABEL[issue.source] ?? issue.source}</td>
                    <td className="px-3 py-2 text-slate-200">
                      {issue.url ? (
                        <a href={issue.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-200">
                          {issue.title}
                        </a>
                      ) : (
                        issue.title
                      )}
                      {issue.packageName && (
                        <p className="font-mono text-[11px] text-slate-500">{issue.packageName}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{formatAge(issue.ageHours)}</td>
                    <td className={`px-5 py-2 text-xs ${issue.overdue ? "text-rose-200" : "text-slate-400"}`}>
                      {issue.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">
              確認した情報源（必須 {requiredOk}/{required.length}）
            </h4>
          </div>
          <ul className="divide-y divide-white/5 text-sm">
            {required.map((c) => (
              <SourceRow key={c.source} c={c} fallbackAt={triage.generatedAt} />
            ))}
          </ul>
          {optional.length > 0 && (
            <>
              <p className="border-t border-white/10 bg-white/[0.02] px-5 py-2 text-[11px] text-slate-500">
                任意（GitHub 読み取りトークン未設定でも、代替の確認を毎日実行）
              </p>
              <ul className="divide-y divide-white/5 text-sm">
                {optional.map((c) => (
                  <SourceRow key={c.source} c={c} fallbackAt={triage.generatedAt} />
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">診断に使う AI モデル</h4>
          </div>
          <ModelPanel selection={triage.modelSelection} usedModel={triage.aiModel} />
        </div>
      </div>

      <div className="pt-6">
        <SectionHeader
          step="4"
          title="環境・ソースの改善"
          subtitle="依存パッケージとホスト（SWA Node）の自動修正。検証後に反映済みのものと待ちの PR"
          accent="from-emerald-400 to-teal-500"
          right={
            <div className="flex gap-2 text-xs">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                適用 {applied.length}
              </span>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-100">
                待ち {waiting.length}
              </span>
            </div>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">自動適用済み（直近14日）{applied.length} 件</h4>
            <p className="mt-1 text-xs text-slate-500">
              Dependabot のセキュリティ修正と、SWA 上限に合わせたホスト版の自動揃えなど、検証後にマージ・反映されたものです。
            </p>
          </div>
          {applied.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">直近14日の自動適用はありません。</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {applied.map((pr) => (
                <li key={`applied-${pr.number}`} className="flex flex-wrap items-baseline gap-x-2 px-5 py-2.5">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200">
                    {kindLabel(pr.kind)}
                  </span>
                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-cyan-200">
                    #{pr.number} {pr.title}
                  </a>
                  <span className="text-xs text-slate-500">{formatJst(pr.mergedAt)} 適用</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${costsPanelClass} overflow-hidden`}>
          <div className="border-b border-white/10 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">自動パッチ待ち {waiting.length} 件</h4>
            <p className="mt-1 text-xs text-slate-500">
              検証が通れば自動でマージ・本番反映されます。1 日以上残っている場合は検証失敗の可能性があります。
            </p>
          </div>
          {waiting.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">待ちの修正 PR はありません。</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {waiting.map((pr) => (
                <li key={`wait-${pr.number}`} className="flex flex-wrap items-baseline gap-x-2 px-5 py-2.5">
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-100">
                    {kindLabel(pr.kind)}
                  </span>
                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-slate-200 hover:text-cyan-200">
                    #{pr.number} {pr.title}
                  </a>
                  <span className="text-xs text-slate-500">{formatJst(pr.createdAt)} 作成</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        費用: 診断・自動パッチ・コード解析は公開リポジトリの GitHub 無料枠、AI は Gemini 無料枠のみを使用します（追加費用なし）。
      </p>
    </section>
  );
}
