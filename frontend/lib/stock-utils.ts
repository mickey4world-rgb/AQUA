import type { StockMarket, StockWatchWithAdvice } from "@/lib/types/stock";

export type StockSortKey =
  | "registered"
  | "name"
  | "profit-desc"
  | "profit-asc"
  | "change-desc"
  | "change-asc"
  | "value-desc"
  | "value-asc";

export const STOCK_SORT_OPTIONS: { value: StockSortKey; label: string }[] = [
  { value: "registered", label: "登録順" },
  { value: "name", label: "銘柄名" },
  { value: "profit-desc", label: "損益率（高い順）" },
  { value: "profit-asc", label: "損益率（低い順）" },
  { value: "change-desc", label: "前日比（高い順）" },
  { value: "change-asc", label: "前日比（低い順）" },
  { value: "value-desc", label: "評価額（高い順）" },
  { value: "value-asc", label: "評価額（低い順）" },
];

export function normalizeTicker(ticker: string, market: StockMarket): string {
  const trimmed = ticker.trim().toUpperCase();

  if (market === "jp") {
    if (/^\d{4}$/.test(trimmed)) return `${trimmed}.T`;
    if (/^\d{4}\.T$/.test(trimmed)) return trimmed;
    return trimmed;
  }

  return trimmed;
}

export function marketCurrency(market: StockMarket): "USD" | "JPY" {
  return market === "jp" ? "JPY" : "USD";
}

export function marketLabel(market: StockMarket): string {
  return market === "jp" ? "日本株" : "米国株";
}

export function formatPrice(value: number, market: StockMarket): string {
  if (market === "jp") {
    return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  }
  return `$${value.toFixed(2)}`;
}

export function displayTicker(ticker: string, market: StockMarket): string {
  if (market === "jp") return ticker.replace(/\.T$/, "");
  return ticker;
}

export function calcMarketValue(currentPrice: number, shares: number): number {
  return currentPrice * shares;
}

export function calcCostBasis(buyPrice: number, shares: number): number {
  return buyPrice * shares;
}

export function calcProfitAmount(
  currentPrice: number,
  buyPrice: number,
  shares: number,
): number {
  return calcMarketValue(currentPrice, shares) - calcCostBasis(buyPrice, shares);
}

export function formatSignedPrice(
  value: number,
  market: StockMarket,
  withSign = true,
): string {
  const sign = value >= 0 ? "+" : "-";
  const formatted = formatPrice(Math.abs(value), market);
  return withSign ? `${sign}${formatted}` : formatted;
}

function displayName(watch: StockWatchWithAdvice): string {
  return watch.name || watch.advice?.companyName || watch.ticker;
}

function sortValue(
  watch: StockWatchWithAdvice,
  key: Exclude<StockSortKey, "registered" | "name">,
): number {
  const advice = watch.advice;
  if (!advice) return Number.NEGATIVE_INFINITY;

  switch (key) {
    case "profit-desc":
    case "profit-asc":
      return advice.profitPct;
    case "change-desc":
    case "change-asc":
      return advice.changePct;
    case "value-desc":
    case "value-asc":
      return calcMarketValue(advice.currentPrice, watch.shares);
    default:
      return 0;
  }
}

export function sortStockWatches(
  watches: StockWatchWithAdvice[],
  sortKey: StockSortKey,
): StockWatchWithAdvice[] {
  const active = watches.filter((watch) => watch.isActive);

  return [...active].sort((a, b) => {
    switch (sortKey) {
      case "registered":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "name":
        return displayName(a).localeCompare(displayName(b), "ja");
      case "profit-desc":
        return sortValue(b, sortKey) - sortValue(a, sortKey);
      case "profit-asc":
        return sortValue(a, sortKey) - sortValue(b, sortKey);
      case "change-desc":
        return sortValue(b, sortKey) - sortValue(a, sortKey);
      case "change-asc":
        return sortValue(a, sortKey) - sortValue(b, sortKey);
      case "value-desc":
        return sortValue(b, sortKey) - sortValue(a, sortKey);
      case "value-asc":
        return sortValue(a, sortKey) - sortValue(b, sortKey);
      default:
        return 0;
    }
  });
}

export const stockPanelClass =
  "rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl shadow-black/20 backdrop-blur-xl";

export const stockInputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20";

export const stockLabelClass = "block text-sm font-medium text-slate-300";

