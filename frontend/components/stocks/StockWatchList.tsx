"use client";

import { MarketBadge } from "@/components/stocks/StocksPageShell";
import {
  calcMarketValue,
  displayTicker,
  formatPrice,
  STOCK_SORT_OPTIONS,
  stockPanelClass,
  type StockSortKey,
} from "@/lib/stock-utils";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

const actionStyles = {
  hold: "border-sky-400/30 bg-sky-500/15 text-sky-300",
  buy: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
  sell: "border-rose-400/30 bg-rose-500/15 text-rose-300",
  watch: "border-amber-400/30 bg-amber-500/15 text-amber-300",
};

const actionLabels = {
  hold: "保有",
  buy: "買い",
  sell: "売り",
  watch: "様子見",
};

type StockWatchListProps = {
  watches: StockWatchWithAdvice[];
  selectedId: string | null;
  sortKey: StockSortKey;
  onSortChange: (sortKey: StockSortKey) => void;
  onSelect: (id: string) => void;
};

export default function StockWatchList({
  watches,
  selectedId,
  sortKey,
  onSortChange,
  onSelect,
}: StockWatchListProps) {
  if (watches.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        登録された銘柄はありません。上のフォームから追加してください。
      </p>
    );
  }

  return (
    <div className={`overflow-hidden ${stockPanelClass}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">保有銘柄一覧</h2>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          並び替え
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as StockSortKey)}
            className="rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-200 focus:border-cyan-400/50 focus:outline-none"
          >
            {STOCK_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="hidden border-b border-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] sm:gap-3">
        <span>銘柄</span>
        <span>現在値</span>
        <span>前日比</span>
        <span>損益</span>
        <span>判定</span>
      </div>

      <ul className="divide-y divide-white/5">
        {watches.map((watch) => {
          const advice = watch.advice;
          const market = watch.market ?? "us";
          const displayName = watch.name || advice?.companyName || watch.ticker;
          const action = advice?.action ?? "watch";
          const selected = watch.id === selectedId;
          const marketValue =
            advice && watch.shares > 0
              ? calcMarketValue(advice.currentPrice, watch.shares)
              : null;

          return (
            <li key={watch.id}>
              <button
                type="button"
                onClick={() => onSelect(watch.id)}
                className={`w-full px-4 py-3 text-left transition sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] sm:items-center sm:gap-3 ${
                  selected
                    ? "bg-gradient-to-r from-cyan-500/10 to-violet-500/10"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-white">{displayName}</p>
                    <MarketBadge market={market} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {displayTicker(watch.ticker, market)}
                    {marketValue !== null && (
                      <>
                        <span className="mx-1">·</span>
                        評価 {formatPrice(marketValue, market)}
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-2 text-sm sm:mt-0">
                  {advice ? (
                    <span className="font-medium text-slate-100">
                      {formatPrice(advice.currentPrice, market)}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>

                <div className="mt-1 text-sm sm:mt-0">
                  {advice ? (
                    <span
                      className={
                        advice.changePct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {advice.changePct >= 0 ? "+" : ""}
                      {advice.changePct.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>

                <div className="mt-1 text-sm sm:mt-0">
                  {advice ? (
                    <span
                      className={
                        advice.profitPct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {advice.profitPct >= 0 ? "+" : ""}
                      {advice.profitPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>

                <div className="mt-2 sm:mt-0">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${actionStyles[action]}`}
                  >
                    {actionLabels[action]}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
