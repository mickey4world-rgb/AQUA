"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StockWatchDetail from "@/components/stocks/StockWatchDetail";
import StockWatchForm from "@/components/stocks/StockWatchForm";
import StockWatchList from "@/components/stocks/StockWatchList";
import StocksPageShell from "@/components/stocks/StocksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import { sortStockWatches, type StockSortKey } from "@/lib/stock-utils";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

async function fetchWatches(): Promise<StockWatchWithAdvice[] | null> {
  const res = await fetch("/api/stocks/watches");
  if (!res.ok) return null;
  const data = (await res.json()) as StockWatchWithAdvice[];
  return data.filter((w) => (w.market ?? "us") === "us");
}

export default function StocksPage() {
  const [watches, setWatches] = useState<StockWatchWithAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fetchedDetail, setFetchedDetail] = useState<{
    id: string;
    watch: StockWatchWithAdvice | null;
  } | null>(null);
  const [sortKey, setSortKey] = useState<StockSortKey>("registered");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedWatches = useMemo(
    () => sortStockWatches(watches, sortKey),
    [watches, sortKey],
  );

  const selectedDetail = useMemo(() => {
    if (!selectedId) return null;
    if (fetchedDetail?.id === selectedId && fetchedDetail.watch) {
      return fetchedDetail.watch;
    }
    return sortedWatches.find((watch) => watch.id === selectedId) ?? null;
  }, [selectedId, fetchedDetail, sortedWatches]);

  const detailLoading = selectedId !== null && fetchedDetail?.id !== selectedId;

  const applyWatches = useCallback((data: StockWatchWithAdvice[] | null) => {
    if (data) {
      setWatches(data);
      setSelectedId((current) => {
        const active = data.filter((watch) => watch.isActive);
        if (active.length === 0) return null;
        if (current && active.some((watch) => watch.id === current))
          return current;
        return active[0].id;
      });
    }
    setLoading(false);
  }, []);

  const loadWatches = useCallback(async () => {
    applyWatches(await fetchWatches());
  }, [applyWatches]);

  useEffect(() => {
    let cancelled = false;
    fetchWatches().then((data) => {
      if (!cancelled) applyWatches(data);
    });
    return () => {
      cancelled = true;
    };
  }, [applyWatches]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/stocks/watches/${selectedId}?ai=1`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as StockWatchWithAdvice) : null,
      )
      .catch(() => null)
      .then((watch) => {
        if (!cancelled) setFetchedDetail({ id: selectedId, watch });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleDelete(id: string) {
    if (!confirm("この銘柄を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/stocks/watches/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      if (selectedId === id) {
        setSelectedId(null);
        setFetchedDetail(null);
        setMobileView("list");
      }
      await loadWatches();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <StocksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
              US Portfolio
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              保有株（米国）
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
              米国株のウォッチと AI 助言の管理画面です。日本株の自動資産運用（kabu）とは別物で、ここには混ぜません。
            </p>
            <Link
              href="/costs"
              className="mt-3 inline-flex text-sm text-cyan-300/90 underline-offset-2 hover:underline"
            >
              日本株の自動運用・条件は「コスト → 資産運用 · 株式」へ →
            </Link>
          </div>
          {!loading && sortedWatches.length > 0 && (
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
              <span className="font-semibold text-white">
                {sortedWatches.length}
              </span>{" "}
              銘柄をウォッチ中
            </div>
          )}
        </div>

        <section className="mt-8">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
              マーケットデータを読み込み中...
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div
                className={`lg:col-span-2 ${mobileView === "detail" ? "hidden lg:block" : ""}`}
              >
                <StockWatchList
                  watches={sortedWatches}
                  selectedId={selectedId}
                  sortKey={sortKey}
                  onSortChange={setSortKey}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setMobileView("detail");
                  }}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />
              </div>
              <div
                className={`lg:col-span-3 ${mobileView === "list" ? "hidden lg:block" : ""}`}
              >
                {mobileView === "detail" && (
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 lg:hidden"
                  >
                    ← 一覧に戻る
                  </button>
                )}
                {selectedDetail ? (
                  <StockWatchDetail
                    watch={selectedDetail}
                    aiLoading={detailLoading}
                    onDelete={handleDelete}
                  />
                ) : (
                  <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center lg:min-h-[28rem]">
                    <p className="text-sm text-slate-400">
                      一覧から銘柄を選択すると、詳細情報が表示されます。
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="mt-12 border-t border-white/10 pt-10">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/70">
              Register
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              米国株を追加
            </h2>
          </div>
          <StockWatchForm onCreated={loadWatches} />
        </section>
      </main>
    </StocksPageShell>
  );
}
