import type { StockMarket } from "@/lib/types/stock";

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
