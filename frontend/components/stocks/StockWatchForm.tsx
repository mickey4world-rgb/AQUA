"use client";

import { useState } from "react";
import {
  stockInputClass,
  stockLabelClass,
  stockPanelClass,
} from "@/lib/stock-utils";
import type { StockMarket } from "@/lib/types/stock";

type StockWatchFormProps = {
  onCreated: () => void;
};

export default function StockWatchForm({ onCreated }: StockWatchFormProps) {
  const [market] = useState<StockMarket>("us");
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

  const currencyLabel = "USD";
  const tickerPlaceholder = "TSLA";
  const namePlaceholder = "Tesla, Inc.";
  const pricePlaceholder = "395.00";

  return (
    <form onSubmit={handleSubmit} className={`${stockPanelClass} p-5`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">米国株を追加</h2>
        <span className="text-xs uppercase tracking-wider text-slate-500">
          US Markets
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={stockLabelClass}>銘柄コード</label>
          <input
            required
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onBlur={(e) => lookupName(e.target.value)}
            placeholder={tickerPlaceholder}
            className={stockInputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            ティッカーシンボル（例: TSLA）を入力
          </p>
        </div>
        <div>
          <label className={stockLabelClass}>銘柄名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            className={stockInputClass}
          />
          {lookupLoading && (
            <p className="mt-1 text-xs text-slate-500">銘柄名を取得中...</p>
          )}
        </div>
        <div>
          <label className={stockLabelClass}>購入価格（{currencyLabel}）</label>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder={pricePlaceholder}
            className={stockInputClass}
          />
        </div>
        <div>
          <label className={stockLabelClass}>保有株数</label>
          <input
            type="number"
            step="1"
            min="0"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="100"
            className={stockInputClass}
          />
        </div>
        <div>
          <label className={stockLabelClass}>目標倍率</label>
          <input
            type="number"
            step="0.1"
            min="1"
            value={targetMultiplier}
            onChange={(e) => setTargetMultiplier(e.target.value)}
            className={stockInputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={stockLabelClass}>メモ（任意）</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="US · 長期保有 など"
            className={stockInputClass}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-400 hover:to-violet-400 disabled:opacity-50"
      >
        {loading ? "登録中..." : "銘柄を登録"}
      </button>
    </form>
  );
}
