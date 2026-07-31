"use client";

import { useState } from "react";
import { marketLabel } from "@/lib/stock-utils";
import type { StockMarket } from "@/lib/types/stock";

type StockWatchFormProps = {
  onCreated: () => void;
};

export default function StockWatchForm({ onCreated }: StockWatchFormProps) {
  const [market, setMarket] = useState<StockMarket>("us");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("");
  const [targetMultiplier, setTargetMultiplier] = useState("1.3");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookupName(symbol: string) {
    if (!symbol.trim()) return;
    setLookupLoading(true);
    try {
      const params = new URLSearchParams({ ticker: symbol, market });
      const res = await fetch(`/api/stocks/lookup?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { name?: string | null };
        if (data.name) setName(data.name);
      }
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/stocks/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        market,
        name: name.trim() || undefined,
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
    setName("");
    setBuyPrice("");
    setShares("");
    setTargetMultiplier("1.3");
    setMemo("");
    setLoading(false);
    onCreated();
  }

  const currencyLabel = market === "jp" ? "JPY" : "USD";
  const tickerPlaceholder = market === "jp" ? "7203" : "TSLA";
  const namePlaceholder = market === "jp" ? "トヨタ自動車" : "Tesla, Inc.";
  const pricePlaceholder = market === "jp" ? "2500" : "395.00";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-zinc-900">保有銘柄を追加</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700">市場</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as StockMarket)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="us">米国株</option>
            <option value="jp">日本株</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            銘柄コード
          </label>
          <input
            required
            value={ticker}
            onChange={(e) =>
              setTicker(
                market === "jp"
                  ? e.target.value.replace(/[^\d.]/g, "")
                  : e.target.value.toUpperCase(),
              )
            }
            onBlur={(e) => lookupName(e.target.value)}
            placeholder={tickerPlaceholder}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {market === "jp"
              ? "4桁コード（例: 7203）を入力"
              : "ティッカーシンボル（例: TSLA）を入力"}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            銘柄名
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          {lookupLoading && (
            <p className="mt-1 text-xs text-zinc-500">銘柄名を取得中...</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            購入価格（{currencyLabel}）
          </label>
          <input
            required
            type="number"
            step={market === "jp" ? "1" : "0.01"}
            min={market === "jp" ? "1" : "0.01"}
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder={pricePlaceholder}
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
            placeholder="100"
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
            placeholder={`${marketLabel(market)} · 長期保有 など`}
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
