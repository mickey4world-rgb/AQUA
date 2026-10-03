"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import type { StockEquityPerformance } from "@/lib/stock-equity-performance";
import {
  formatStockTradeReasonWithRules,
  type StockTradeRuleCategory,
} from "@/lib/stock-trade-rules";
import StockTradeRulesPanel from "@/components/stocks/StockTradeRulesPanel";
import StockEquityChart from "@/components/stocks/StockEquityChart";
import StockTradeActivityPanel from "@/components/stocks/StockTradeActivityPanel";
import StockAuditLessonsPanel, {
  type StockAuditLessonView,
} from "@/components/stocks/StockAuditLessonsPanel";
import type { StockBrokerActivity } from "@/lib/stock-broker-activity";
import type { StockVmRuntimeStatus } from "@/lib/stock-vm-status";
import {
  buildWeeklyChangeItems,
  weeklyChangeBadgeByCode,
} from "@/lib/stock-weekly-change-labels";

type ApiRule = {
  id: number;
  category: StockTradeRuleCategory;
  categoryLabel: string;
  title: string;
  summary: string;
};

type Goals = {
  principalYen: number;
  monthlySellProfitTargetYen: number;
  monthlySellProfitTargetRate: number;
  smallInvestCashFloorYen: number;
  smallInvestMode: boolean;
};

type GuardrailsView = {
  monthlyHalt?: boolean;
  mainBreaker?: boolean;
  monthlyLossYen?: number;
  cumulativeLossYen?: number;
  notes?: string[];
  tradingHalted?: boolean;
  layers?: {
    perTradeMaxLossYen: number;
    monthlyMaxLossYen: number;
    cumulativeMaxLossYen: number;
  };
};

type TradeCandidate = {
  code: string;
  watchId?: string | null;
  name: string;
  isActive: boolean;
  registered: boolean;
  shares: number;
  heldQty: number;
  buyPrice: number;
  targetPrice: number;
  memo?: string;
  tier?: string | null;
  tags?: string[];
  newsFitBonus?: number;
  weeklyScore?: number | null;
  lotYen?: number | null;
  affordable?: boolean | null;
};

type LiveMode = {
  allowLiveOrders: boolean;
  kabuPort: number | null;
  productionApi: boolean;
  source: string;
};

type StatusResponse = {
  connected: boolean;
  snapshot: StockBrokerSnapshot | null;
  recentOrders?: StockBrokerOrderRecord[];
  tradeRules?: ApiRule[];
  tradeLessons?: StockAuditLessonView[];
  lessonNotes?: string[];
  equityPerformance?: StockEquityPerformance;
  tradeCandidates?: TradeCandidate[];
  activity?: StockBrokerActivity;
  liveMode?: LiveMode;
  goals?: Goals;
  guardrails?: GuardrailsView;
  weeklyUniverseReview?: {
    weekId: string;
    applied: boolean;
    dryRun: boolean;
    summary: string;
    desiredActiveCodes: string[];
    appliedActions?: Array<{
      type: string;
      code: string;
      ok?: boolean;
      error?: string;
    }>;
    newsDigestId?: string | null;
    createdAt: string;
  } | null;
  vmStatus?: StockVmRuntimeStatus;
  policy?: string;
  hint?: string;
};

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

function formatSyncedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

function hoursSince(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function statusLabel(status: StockBrokerOrderRecord["status"]): string {
  switch (status) {
    case "dry_run":
      return "dry-run";
    case "submitted":
      return "発注済";
    case "rejected":
      return "拒否";
    case "skipped":
      return "スキップ";
    default:
      return status;
  }
}

type Props = {
  /** @deprecated 米国株ページとは分離済み。互換のため残置 */
  compact?: boolean;
  /** 銘柄追加など外部操作後に再取得させるカウンタ */
  refreshToken?: number;
};

export default function StockBrokerPanel({
  compact: _compact = false,
  refreshToken = 0,
}: Props) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    return fetch("/api/stocks/broker/status")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as StatusResponse)
          : Promise.reject(new Error("status fetch failed")),
      )
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch(() => {
        setError("証券同期状況を取得できませんでした。");
        setData(null);
      });
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me")
      .then(async (res) =>
        res.ok ? ((await res.json()) as { id?: string }) : null,
      )
      .then((user) => {
        if (!cancelled && user?.id) setViewerUserId(user.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDeleteWatch(candidate: TradeCandidate) {
    if (!candidate.watchId || !candidate.registered) return;
    const label = `${candidate.name}（${candidate.code}）`;
    if (
      !confirm(
        `${label} を登録から削除しますか？\n自動売買の対象外になります。`,
      )
    ) {
      return;
    }
    setDeletingId(candidate.watchId);
    try {
      const res = await fetch(`/api/stocks/watches/${candidate.watchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("銘柄の削除に失敗しました。");
        return;
      }
      setError(null);
      await loadStatus();
    } catch {
      setError("銘柄の削除に失敗しました。");
    } finally {
      setDeletingId(null);
    }
  }

  const orders = data?.recentOrders ?? [];
  const liveOrders = orders.filter((o) => o.status === "submitted");
  const dryOrders = orders.filter((o) => o.status === "dry_run");
  const goals = data?.goals;

  const syncAgeHours = useMemo(() => {
    if (!data?.snapshot?.syncedAt) return null;
    return hoursSince(data.snapshot.syncedAt);
  }, [data?.snapshot?.syncedAt]);

  const syncStale = syncAgeHours != null && syncAgeHours > 24;

  const goalBadge = goals
    ? `元本目安 ${formatYen(goals.principalYen)} · 月次売り益 ${(goals.monthlySellProfitTargetRate * 100).toFixed(1)}%（${formatYen(goals.monthlySellProfitTargetYen)}）`
    : "元本目安 80万 · 月次売り益 2%";

  const liveMode = data?.liveMode;
  const allowLive = liveMode?.allowLiveOrders === true;
  const productionApi = liveMode?.productionApi === true;
  const candidates = data?.tradeCandidates ?? [];
  const activeCandidates = candidates.filter((c) => c.isActive);
  const parkedCandidates = candidates.filter((c) => !c.isActive && c.registered);
  const unregistered = candidates.filter((c) => !c.registered);

  const weeklyChanges = useMemo(() => {
    const nameByCode = new Map(
      candidates.map((c) => [c.code, c.name] as const),
    );
    return buildWeeklyChangeItems(
      data?.weeklyUniverseReview?.appliedActions,
      nameByCode,
    );
  }, [candidates, data?.weeklyUniverseReview?.appliedActions]);

  const weeklyBadges = useMemo(
    () => weeklyChangeBadgeByCode(weeklyChanges),
    [weeklyChanges],
  );
  const weeklyAdds = weeklyChanges.filter((c) => c.side === "add");
  const weeklyRemoves = weeklyChanges.filter((c) => c.side === "remove");

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
            Stocks · Broker
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">
            株式（証券同期・自動発注）
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              allowLive
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                : "border-amber-400/30 bg-amber-500/15 text-amber-100"
            }`}
          >
            {allowLive ? "LIVE 発注オン" : "検証 · dry-run"}
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              productionApi
                ? "border-sky-400/35 bg-sky-500/15 text-sky-100"
                : "border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            {liveMode?.kabuPort
              ? `API :${liveMode.kabuPort}${productionApi ? " 本番" : " 検証"}`
              : "API 未同期"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
            {goalBadge}
          </span>
          {goals?.smallInvestMode && (
            <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-100">
              少額投資モード（現金&lt;{formatYen(goals.smallInvestCashFloorYen)}）
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        日本株・kabu 自動運用です。米国株の「保有株」ページとは別系統。
        LIVE 表示は VM sync の{" "}
        <code className="text-cyan-200/80">KABU_ALLOW_LIVE_ORDERS</code> / ポートを反映します。
        監視メモ銘柄もアクティブより好条件なら買い可。
        {data?.policy ? ` ポリシー: ${data.policy}` : null}
      </p>
      <p className="mt-2">
        <Link
          href="/costs/kabu-check"
          className="inline-flex rounded-full border border-cyan-400/35 bg-cyan-500/15 px-3 py-1 text-[12px] font-medium text-cyan-50"
        >
          外出先確認（携帯向け）→
        </Link>
      </p>

      {data?.vmStatus && (
        <div
          className={`mt-3 rounded-xl border px-3 py-2.5 ${
            data.vmStatus.state === "running"
              ? "border-emerald-400/35 bg-emerald-500/10"
              : data.vmStatus.state === "idle_ok"
                ? "border-sky-400/30 bg-sky-500/10"
                : data.vmStatus.state === "stale"
                  ? "border-amber-400/35 bg-amber-500/10"
                  : "border-white/15 bg-white/[0.04]"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                data.vmStatus.state === "running"
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-50"
                  : data.vmStatus.state === "idle_ok"
                    ? "border-sky-400/40 bg-sky-500/20 text-sky-50"
                    : data.vmStatus.state === "stale"
                      ? "border-amber-400/40 bg-amber-500/20 text-amber-50"
                      : "border-white/20 bg-white/10 text-slate-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  data.vmStatus.state === "running"
                    ? "bg-emerald-300"
                    : data.vmStatus.state === "idle_ok"
                      ? "bg-sky-300"
                      : data.vmStatus.state === "stale"
                        ? "bg-amber-300"
                        : "bg-slate-400"
                }`}
              />
              Azure VM · {data.vmStatus.label}
            </span>
            <span className="text-[11px] text-slate-400">
              {data.vmStatus.sessionOpenNow ? "おおよそ場中" : "場外寄り"}
              {data.vmStatus.kabuPort != null
                ? ` · API :${data.vmStatus.kabuPort}`
                : ""}
              {data.vmStatus.allowLiveOrders === true
                ? " · LIVE"
                : data.vmStatus.allowLiveOrders === false
                  ? " · dry-run"
                  : ""}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-slate-200/90">
            {data.vmStatus.detail}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            最終同期:{" "}
            {data.vmStatus.lastSyncedAt
              ? formatSyncedAt(data.vmStatus.lastSyncedAt)
              : "なし"}
            {" · "}
            最終 trade/点検:{" "}
            {data.vmStatus.lastHeartbeatAt
              ? formatSyncedAt(data.vmStatus.lastHeartbeatAt)
              : "なし"}
          </p>
        </div>
      )}

      {data?.weeklyUniverseReview && (
        <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2.5 text-[12px] text-cyan-50/95">
          <p className="font-medium text-cyan-100">
            週末の銘柄入れ替え #{data.weeklyUniverseReview.weekId}
            {data.weeklyUniverseReview.dryRun
              ? " · 試算のみ"
              : data.weeklyUniverseReview.applied
                ? " · 反映済み"
                : ""}
            {data.weeklyUniverseReview.createdAt
              ? ` · ${formatSyncedAt(data.weeklyUniverseReview.createdAt)}`
              : ""}
          </p>
          <p className="mt-1 text-[11px] text-cyan-100/75">
            {data.weeklyUniverseReview.summary}
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
                追加した銘柄
              </p>
              {weeklyAdds.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-400">なし</p>
              ) : (
                <ul className="mt-1 space-y-1 text-[11px] text-emerald-50">
                  {weeklyAdds.map((item) => (
                    <li key={`add-${item.code}`}>
                      <span className="font-medium">
                        {item.name}（{item.code}）
                      </span>
                      <span className="text-emerald-100/70">
                        {" "}
                        — {item.verb}
                        {!item.ok ? " · 失敗" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/90">
                外した銘柄（監視メモへ）
              </p>
              {weeklyRemoves.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-400">なし</p>
              ) : (
                <ul className="mt-1 space-y-1 text-[11px] text-amber-50">
                  {weeklyRemoves.map((item) => (
                    <li key={`rm-${item.code}`}>
                      <span className="font-medium">
                        {item.name}（{item.code}）
                      </span>
                      <span className="text-amber-100/70">
                        {" "}
                        — {item.verb}
                        {!item.ok ? " · 失敗" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {data.weeklyUniverseReview.desiredActiveCodes.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-300">
              いまのアクティブ希望:{" "}
              {data.weeklyUniverseReview.desiredActiveCodes.join(", ")}
            </p>
          )}
          {data.weeklyUniverseReview.newsDigestId && (
            <p className="mt-1 text-[11px] text-slate-400">
              News Search: {data.weeklyUniverseReview.newsDigestId}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      {data?.activity && <StockTradeActivityPanel activity={data.activity} />}

      {candidates.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              売買候補一覧
            </p>
            <p className="text-[11px] text-slate-500">
              アクティブ {activeCandidates.length} · 監視メモ{" "}
              {parkedCandidates.length}
              {unregistered.length > 0
                ? ` · 未登録 ${unregistered.length}`
                : ""}
            </p>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">状態</th>
                  <th className="px-3 py-2 font-medium">コード</th>
                  <th className="px-3 py-2 font-medium">銘柄</th>
                  <th className="px-3 py-2 font-medium">参考単価</th>
                  <th className="px-3 py-2 font-medium">単元</th>
                  <th className="px-3 py-2 font-medium">保有</th>
                  <th className="px-3 py-2 font-medium">週次</th>
                  <th className="px-3 py-2 font-medium">メモ</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {candidates.map((c) => {
                  const status = !c.registered
                    ? "未登録"
                    : c.isActive
                      ? "アクティブ"
                      : "監視メモ（好条件なら買い可）";
                  const statusClass = !c.registered
                    ? "text-slate-500"
                    : c.isActive
                      ? "text-emerald-300"
                      : "text-amber-200";
                  return (
                    <tr key={c.code} className="text-slate-300">
                      <td className={`px-3 py-2 whitespace-nowrap ${statusClass}`}>
                        <span className="block">{status}</span>
                        {weeklyBadges.get(c.code) && (
                          <span
                            className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] ${
                              weeklyBadges.get(c.code) === "今週追加"
                                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                                : "border-amber-400/35 bg-amber-500/15 text-amber-100"
                            }`}
                          >
                            {weeklyBadges.get(c.code)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-200">
                        {c.code}
                      </td>
                      <td className="px-3 py-2 text-white">
                        <span className="block max-w-[10rem] truncate sm:max-w-none">
                          {c.name}
                        </span>
                        {c.tier && (
                          <span className="text-[10px] text-slate-500">
                            {c.tier}
                            {c.newsFitBonus && c.newsFitBonus > 0
                              ? ` · News+${c.newsFitBonus}`
                              : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.buyPrice > 0 ? formatYen(c.buyPrice) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.lotYen != null
                          ? formatYen(c.lotYen)
                          : c.buyPrice > 0
                            ? formatYen(c.buyPrice * 100)
                            : "—"}
                        {c.affordable === false ? (
                          <span className="ml-1 text-[10px] text-rose-300">
                            枠外
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.heldQty > 0
                          ? `${c.heldQty.toLocaleString("ja-JP")}株`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-400">
                        {c.weeklyScore != null ? c.weeklyScore : "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[14rem] truncate text-slate-500">
                        {c.memo || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.registered && c.watchId ? (
                          <button
                            type="button"
                            disabled={deletingId === c.watchId}
                            onClick={() => void handleDeleteWatch(c)}
                            className="rounded-md border border-rose-400/30 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:border-rose-300/50 hover:bg-rose-500/10 disabled:opacity-50"
                          >
                            {deletingId === c.watchId ? "削除中…" : "削除"}
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.guardrails?.mainBreaker || data?.guardrails?.tradingHalted ? (
        <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-50">
          <p className="font-semibold">第3層メインブレーカー作動中</p>
          <p className="mt-1 text-[12px] text-rose-100/90">
            通算損失上限に達したため売買権限を停止し、保有の全決済を優先します。再開は手動解除が必要です。
          </p>
          {(data.guardrails.notes ?? []).map((n) => (
            <p key={n} className="mt-1 text-[11px] text-rose-100/80">
              {n}
            </p>
          ))}
        </div>
      ) : data?.guardrails?.monthlyHalt ? (
        <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/12 px-3 py-2 text-sm text-amber-50">
          <p className="font-semibold">第2層: 当月の自動売買を停止中</p>
          <p className="mt-1 text-[12px] text-amber-100/85">
            当月実現損失が上限（
            {formatYen(data.guardrails.layers?.monthlyMaxLossYen ?? 45_000)}
            ）に達しました。硬損切り以外の新規売買は見送ります。
          </p>
        </div>
      ) : null}

      {data?.guardrails?.layers && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[11px] text-slate-400">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            第1層 1取引 ≤{" "}
            <span className="text-slate-200">
              {formatYen(data.guardrails.layers.perTradeMaxLossYen)}
            </span>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            第2層 月次 ≤{" "}
            <span className="text-slate-200">
              {formatYen(data.guardrails.layers.monthlyMaxLossYen)}
            </span>
            {typeof data.guardrails.monthlyLossYen === "number" && (
              <span className="text-slate-500">
                {" "}
                · 今月損 {formatYen(data.guardrails.monthlyLossYen)}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            第3層 通算 ≤{" "}
            <span className="text-slate-200">
              {formatYen(data.guardrails.layers.cumulativeMaxLossYen)}
            </span>
            {typeof data.guardrails.cumulativeLossYen === "number" && (
              <span className="text-slate-500">
                {" "}
                · 累計損 {formatYen(data.guardrails.cumulativeLossYen)}
              </span>
            )}
          </div>
        </div>
      )}

      {!data && !error && (
        <p className="mt-3 text-sm text-slate-400">読み込み中…</p>
      )}

      {data && !data.connected && (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
          <p>まだこのログインユーザー向けの同期がありません。</p>
          <p className="mt-1 text-[11px] text-amber-100/80">
            {data.hint ??
              "Azure VM 上で kabu-bridge: npm run sync（docs/STOCK_KABU_AZURE_VM.md）"}
          </p>
          {viewerUserId && (
            <p className="mt-2 break-all rounded-lg border border-amber-400/20 bg-black/20 px-2 py-1.5 font-mono text-[11px] text-amber-50/90">
              VM の .env に入れる AQUA_USER_ID = {viewerUserId}
            </p>
          )}
        </div>
      )}

      {data?.connected &&
        viewerUserId &&
        data.snapshot &&
        data.snapshot.userId !== viewerUserId && (
          <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-50">
            同期データの userId（{data.snapshot.userId}）とログイン（
            {viewerUserId}）が一致していません。VM の AQUA_USER_ID
            をログイン ID に合わせて再 sync してください。
          </div>
        )}

      {data?.equityPerformance && (
        <div className="mt-4">
          <StockEquityChart perf={data.equityPerformance} />
        </div>
      )}

      {data?.snapshot && (
        <div className="mt-4 space-y-4">
          {syncStale && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50">
              最終同期から約 {Math.floor(syncAgeHours ?? 0)}{" "}
              時間経過しています。VM が止まっている／市場外のときは更新されません。様子見中は「最終同期時点」のスナップショットとして読んでください。
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                株式余力
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {formatYen(data.snapshot.cash.stockAccountWallet)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                保有銘柄
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {data.snapshot.holdings.length}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                最終同期（JST）
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {formatSyncedAt(data.snapshot.syncedAt)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
              dry-run ログ{" "}
              <span className="font-semibold text-amber-200">{dryOrders.length}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
              LIVE 発注ログ{" "}
              <span className="font-semibold text-emerald-200">
                {liveOrders.length}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              保有 ({data.snapshot.holdings.length})
            </p>
            {data.snapshot.holdings.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                保有なし（最終同期時点）。手元に株がある場合は次回 sync
                で反映されます。
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10">
                {data.snapshot.holdings.map((h) => (
                  <li
                    key={`${h.symbol}-${h.exchange}-${h.side ?? ""}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">
                        {h.symbolName || h.symbol}
                      </p>
                      <p className="text-[11px] text-slate-500">{h.symbol}</p>
                    </div>
                    <div className="shrink-0 text-right text-slate-200">
                      <p>{h.qty.toLocaleString("ja-JP")}株</p>
                      <p className="text-[11px] text-slate-500">
                        @{formatYen(h.price)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            直近の自動発注ログ
          </p>
          <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {o.side === "sell" ? "売" : "買"} {o.symbol} ×{o.qty}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {formatStockTradeReasonWithRules(o.reason, o.ruleIds) ||
                      o.message ||
                      o.reason}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-slate-400">
                  <p
                    className={
                      o.status === "submitted"
                        ? "text-emerald-300"
                        : o.status === "rejected"
                          ? "text-rose-300"
                          : o.status === "dry_run"
                            ? "text-amber-200"
                            : ""
                    }
                  >
                    {statusLabel(o.status)}
                  </p>
                  <p>{formatSyncedAt(o.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <StockAuditLessonsPanel
          lessons={data?.tradeLessons}
          lessonNotes={data?.lessonNotes}
        />
      </div>

      <div className="mt-6">
        <StockTradeRulesPanel rules={data?.tradeRules} />
      </div>
    </section>
  );
}
