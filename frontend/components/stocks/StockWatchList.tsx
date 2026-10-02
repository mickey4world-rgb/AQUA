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
  onDelete?: (id: string) => void;
  deletingId?: string | null;
};

export default function StockWatchList({
  watches,
  selectedId,
  sortKey,
  onSortChange,
  onSelect,
  onDelete,
  deletingId = null,
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

      <div className="hidden border-b border-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_auto] sm:gap-3">
        <span>銘柄</span>
        <span>現在値</span>
        <span>前日比</span>
        <span>損益</span>
        <span>判定</span>
        <span className="sr-only">操作</span>
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
          const busy = deletingId === watch.id;

          return (
            <li key={watch.id}>
              <div
                className={`flex items-stretch gap-2 px-2 sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_auto] sm:items-center sm:gap-3 sm:px-4 ${
                  selected
                    ? "bg-gradient-to-r from-cyan-500/10 to-violet-500/10"
                    : "hover:bg-white/5"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(watch.id)}
                  className="min-w-0 flex-1 py-3 text-left sm:contents"
                >
                  <div className="min-w-0 px-2 sm:px-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-white">
                        {displayName}
                      </p>
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

                  <div className="mt-2 hidden text-sm sm:mt-0 sm:block">
                    {advice ? (
                      <span className="font-medium text-slate-100">
                        {formatPrice(advice.currentPrice, market)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </div>

                  <div className="mt-1 hidden text-sm sm:mt-0 sm:block">
                    {advice ? (
                      <span
                        className={
                          advice.changePct >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }
                      >
                        {advice.changePct >= 0 ? "+" : ""}
                        {advice.changePct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </div>

                  <div className="mt-1 hidden text-sm sm:mt-0 sm:block">
                    {advice ? (
                      <span
                        className={
                          advice.profitPct >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
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

                {onDelete && (
                  <div className="flex shrink-0 items-center py-3 pr-2 sm:pr-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(watch.id);
                      }}
                      className="rounded-md border border-rose-400/30 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:border-rose-300/50 hover:bg-rose-500/10 disabled:opacity-50"
                      aria-label={`${displayName} を削除`}
                    >
                      {busy ? "削除中…" : "削除"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
