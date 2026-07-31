"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import StockWatchDetail from "@/components/stocks/StockWatchDetail";
import StockWatchForm from "@/components/stocks/StockWatchForm";
import StockWatchList from "@/components/stocks/StockWatchList";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

export default function StocksPage() {
  const [watches, setWatches] = useState<StockWatchWithAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeWatches = useMemo(
    () => watches.filter((watch) => watch.isActive),
    [watches],
  );

  const selectedWatch = useMemo(
    () => activeWatches.find((watch) => watch.id === selectedId) ?? null,
    [activeWatches, selectedId],
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

  async function handleDelete(id: string) {
    if (!confirm("この銘柄を削除しますか？")) return;
    await fetch(`/api/stocks/watches/${id}`, { method: "DELETE" });
    loadWatches();
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold text-zinc-900">保有株</h1>
        <p className="mt-2 text-zinc-600">
          米国株・日本株を登録し、一覧から銘柄を選んで売買アドバイスの詳細を確認できます。
        </p>

        <div className="mt-8">
          <StockWatchForm onCreated={loadWatches} />
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-900">保有銘柄一覧</h2>
            {!loading && activeWatches.length > 0 && (
              <p className="text-sm text-zinc-500">{activeWatches.length} 銘柄</p>
            )}
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">読み込み中...</p>
          ) : (
            <div className="mt-4 grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <StockWatchList
                  watches={watches}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
              <div className="lg:col-span-3">
                {selectedWatch ? (
                  <StockWatchDetail watch={selectedWatch} onDelete={handleDelete} />
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                    左の一覧から銘柄を選択すると、詳細情報が表示されます。
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
