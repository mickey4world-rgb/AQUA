"use client";

import { useEffect, useMemo, useState } from "react";
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import type { StockEquityPerformance } from "@/lib/stock-equity-performance";
import {
  formatStockTradeReasonWithRules,
  type StockTradeRuleCategory,
} from "@/lib/stock-trade-rules";
import StockTradeRulesPanel from "@/components/stocks/StockTradeRulesPanel";
import StockEquityChart from "@/components/stocks/StockEquityChart";
import StockAuditLessonsPanel, {
  type StockAuditLessonView,
} from "@/components/stocks/StockAuditLessonsPanel";

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

type StatusResponse = {
  connected: boolean;
  snapshot: StockBrokerSnapshot | null;
  recentOrders?: StockBrokerOrderRecord[];
  tradeRules?: ApiRule[];
  tradeLessons?: StockAuditLessonView[];
  lessonNotes?: string[];
  equityPerformance?: StockEquityPerformance;
  goals?: Goals;
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
};

export default function StockBrokerPanel({ compact: _compact = false }: Props) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stocks/broker/status")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as StatusResponse)
          : Promise.reject(new Error("status fetch failed")),
      )
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("証券同期状況を取得できませんでした。");
          setData(null);
        }
      });
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
          <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-100">
            検証 · dry-run
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
            {goalBadge}
          </span>
          {goals?.smallInvestMode && (
            <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-100">
              少額投資モード（現金&lt;{formatYen(goals.smallInvestCashFloorYen)}）
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
            LIVE 発注オフ
          </span>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        日本株・kabu 自動運用です。米国株の「保有株」ページとは別系統。
        方針C: 現物の買い／売りシミュレーション（dry-run 既定）。
        <code className="text-cyan-200/80">KABU_ALLOW_LIVE_ORDERS=1</code>{" "}
        で本番発注。
        {data?.policy ? ` ポリシー: ${data.policy}` : null}
      </p>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

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
