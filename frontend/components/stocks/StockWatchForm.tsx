"use client";

import { useState } from "react";

type StockWatchFormProps = {
  onCreated: () => void;
};

export default function StockWatchForm({ onCreated }: StockWatchFormProps) {
  const [ticker, setTicker] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("");
  const [targetMultiplier, setTargetMultiplier] = useState("1.3");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/stocks/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        buyPrice: parseFloat(buyPrice),
        shares: shares ? parseFloat(shares) : 0,
        targetMultiplier: parseFloat(targetMultiplier),
        memo: memo || undefined,
      }),
    });

    if (!res.ok) {
      setError("登録に失敗しました");
      setLoading(false);
      return;
    }

    setTicker("");
    setBuyPrice("");
    setShares("");
    setTargetMultiplier("1.3");
    setMemo("");
    setLoading(false);
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-zinc-900">保有銘柄を追加</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            銘柄コード
          </label>
          <input
            required
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="TSLA"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            購入価格（USD）
          </label>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder="395.00"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            保有株数
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="10"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            目標倍率
          </label>
          <input
            type="number"
            step="0.1"
            min="1"
            value={targetMultiplier}
            onChange={(e) => setTargetMultiplier(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700">
            メモ（任意）
          </label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="長期保有、配当狙い など"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "登録中..." : "銘柄を登録"}
      </button>
    </form>
  );
}
