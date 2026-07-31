"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import StockWatchCard from "@/components/stocks/StockWatchCard";
import StockWatchForm from "@/components/stocks/StockWatchForm";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

export default function StocksPage() {
  const [watches, setWatches] = useState<StockWatchWithAdvice[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWatches = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/stocks/watches");
    if (res.ok) {
      setWatches(await res.json());
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
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold text-zinc-900">米国株</h1>
        <p className="mt-2 text-zinc-600">
          保有銘柄を登録すると、移動平均線と目標株価に基づく売買アドバイスを表示します。
        </p>

        <div className="mt-8">
          <StockWatchForm onCreated={loadWatches} />
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">保有銘柄一覧</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">読み込み中...</p>
          ) : watches.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              登録された銘柄はありません。上のフォームから追加してください。
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {watches.map((watch) => (
                <StockWatchCard
                  key={watch.id}
                  watch={watch}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
