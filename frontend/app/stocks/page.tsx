"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StockWatchDetail from "@/components/stocks/StockWatchDetail";
import StockWatchForm from "@/components/stocks/StockWatchForm";
import StockWatchList from "@/components/stocks/StockWatchList";
import StocksPageShell from "@/components/stocks/StocksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import { sortStockWatches, type StockSortKey } from "@/lib/stock-utils";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

export default function StocksPage() {
  const [watches, setWatches] = useState<StockWatchWithAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<StockWatchWithAdvice | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [sortKey, setSortKey] = useState<StockSortKey>("registered");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const sortedWatches = useMemo(
    () => sortStockWatches(watches, sortKey),
    [watches, sortKey],
  );

  const loadWatches = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/stocks/watches");
    if (res.ok) {
      const data = (await res.json()) as StockWatchWithAdvice[];
      setWatches(data);
      setSelectedId((current) => {
        const active = data.filter((watch) => watch.isActive);
        if (active.length === 0) return null;
        if (current && active.some((watch) => watch.id === current)) return current;
        return active[0].id;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWatches();
  }, [loadWatches]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    setSelectedDetail(sortedWatches.find((watch) => watch.id === selectedId) ?? null);
  }, [selectedId, sortedWatches]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    setDetailLoading(true);

    fetch(`/api/stocks/watches/${selectedId}?ai=1`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as StockWatchWithAdvice;
      })
      .then((detail) => {
        if (!cancelled && detail) setSelectedDetail(detail);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleDelete(id: string) {
    if (!confirm("この銘柄を削除しますか？")) return;
    await fetch(`/api/stocks/watches/${id}`, { method: "DELETE" });
    loadWatches();
  }

  return (
    <StocksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
              Global Portfolio
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              保有株ダッシュボード
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
              米国・日本の保有銘柄を一覧で俯瞰し、選択した銘柄の売却見込み額と AI
              売買アドバイスを確認できます。
            </p>
          </div>
          {!loading && sortedWatches.length > 0 && (
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
              <span className="font-semibold text-white">{sortedWatches.length}</span> 銘柄をウォッチ中
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
              <div className={`lg:col-span-2 ${mobileView === "detail" ? "hidden lg:block" : ""}`}>
                <StockWatchList
                  watches={sortedWatches}
                  selectedId={selectedId}
                  sortKey={sortKey}
                  onSortChange={setSortKey}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setMobileView("detail");
                  }}
                />
              </div>
              <div className={`lg:col-span-3 ${mobileView === "list" ? "hidden lg:block" : ""}`}>
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
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/10 text-2xl">
                      🌐
                    </div>
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
            <h2 className="mt-2 text-xl font-semibold text-white">銘柄を追加</h2>
            <p className="mt-1 text-sm text-slate-400">
              新しいウォッチ銘柄を登録します。日常の確認は上の一覧・詳細から行えます。
            </p>
          </div>
          <StockWatchForm onCreated={loadWatches} />
        </section>
      </main>
    </StocksPageShell>
  );
}
