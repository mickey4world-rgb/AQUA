"use client";

import {
  displayTicker,
  formatPrice,
  marketLabel,
} from "@/lib/stock-utils";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

const actionStyles = {
  hold: "bg-blue-100 text-blue-800",
  buy: "bg-emerald-100 text-emerald-800",
  sell: "bg-red-100 text-red-800",
  watch: "bg-amber-100 text-amber-800",
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
  onSelect: (id: string) => void;
};

export default function StockWatchList({
  watches,
  selectedId,
  onSelect,
}: StockWatchListProps) {
  const activeWatches = watches.filter((watch) => watch.isActive);

  if (activeWatches.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        登録された銘柄はありません。上のフォームから追加してください。
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="hidden border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] sm:gap-3">
        <span>銘柄</span>
        <span>現在値</span>
        <span>前日比</span>
        <span>損益</span>
        <span>判定</span>
      </div>
      <ul className="divide-y divide-zinc-100">
        {activeWatches.map((watch) => {
          const advice = watch.advice;
          const market = watch.market ?? "us";
          const displayName = watch.name || advice?.companyName || watch.ticker;
          const action = advice?.action ?? "watch";
          const selected = watch.id === selectedId;

          return (
            <li key={watch.id}>
              <button
                type="button"
                onClick={() => onSelect(watch.id)}
                className={`w-full px-4 py-3 text-left transition hover:bg-zinc-50 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] sm:items-center sm:gap-3 ${
                  selected ? "bg-zinc-100" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{displayName}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {displayTicker(watch.ticker, market)}
                    <span className="mx-1">·</span>
                    {marketLabel(market)}
                  </p>
                </div>

                <div className="mt-2 text-sm sm:mt-0">
                  {advice ? (
                    <span className="font-medium text-zinc-900">
                      {formatPrice(advice.currentPrice, market)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </div>

                <div className="mt-1 text-sm sm:mt-0">
                  {advice ? (
                    <span
                      className={
                        advice.changePct >= 0 ? "text-emerald-700" : "text-red-700"
                      }
                    >
                      {advice.changePct >= 0 ? "+" : ""}
                      {advice.changePct.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </div>

                <div className="mt-1 text-sm sm:mt-0">
                  {advice ? (
                    <span
                      className={
                        advice.profitPct >= 0 ? "text-emerald-700" : "text-red-700"
                      }
                    >
                      {advice.profitPct >= 0 ? "+" : ""}
                      {advice.profitPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </div>

                <div className="mt-2 sm:mt-0">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${actionStyles[action]}`}
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
