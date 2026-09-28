"use client";

import { useEffect, useState } from "react";
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

type StatusResponse = {
  connected: boolean;
  snapshot: StockBrokerSnapshot | null;
  recentOrders?: StockBrokerOrderRecord[];
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

export default function StockBrokerPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const orders = data?.recentOrders ?? [];

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
        Broker sync · Auto trade
      </p>
      <h2 className="mt-1 text-base font-semibold text-white">証券口座同期・自動発注</h2>
      <p className="mt-1 text-[11px] text-slate-400">
        ホストは Azure Windows VM（自宅常設PCではない）。詳細は docs/STOCK_KABU_AZURE_VM.md。
        方針C Phase1: 日本株・現物の<strong className="font-medium text-slate-300">売り</strong>
        のみ。買い・信用・米国株は未対応。既定は dry-run（
        <code className="text-cyan-200/80">KABU_ALLOW_LIVE_ORDERS=1</code>{" "}
        で本番発注）。
        {data?.policy ? ` ポリシー: ${data.policy}` : null}
      </p>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      {!data && !error && (
        <p className="mt-3 text-sm text-slate-400">読み込み中…</p>
      )}

      {data && !data.connected && (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
          <p>まだ同期されていません。</p>
          <p className="mt-1 text-[11px] text-amber-100/80">
            {data.hint ??
              "Azure VM 上で kabu-bridge: npm run sync → npm run trade（docs/STOCK_KABU_AZURE_VM.md）"}
          </p>
        </div>
      )}

      {data?.snapshot && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
                最終同期（JST）
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {formatSyncedAt(data.snapshot.syncedAt)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              保有 ({data.snapshot.holdings.length})
            </p>
            {data.snapshot.holdings.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">保有なし</p>
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
                    {o.message || o.reason}
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
    </section>
  );
}
