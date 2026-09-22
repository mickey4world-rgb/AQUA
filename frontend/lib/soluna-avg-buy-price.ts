/**
 * 銘柄の平均取得単価（コスト画面の買値→予想売値・利確判定と共有）
 */
import type { SolunaTradeProduct, SolunaTradeRecord } from "@/lib/types/soluna";

export function normalizeTradeProduct(
  product: string | undefined | null,
): SolunaTradeProduct | string {
  if (!product) return "BTC_JPY";
  return product;
}

/** BUY 取引が当該銘柄か（旧データは product 無し＝BTC） */
export function isBuyForProduct(
  trade: Pick<SolunaTradeRecord, "side" | "product">,
  product: SolunaTradeProduct | string,
): boolean {
  if (trade.side !== "BUY") return false;
  const key = normalizeTradeProduct(trade.product);
  if (key === product) return true;
  // 旧台帳: product 未設定の買いは BTC 扱い
  if (product === "BTC_JPY" && !trade.product) return true;
  return false;
}

/**
 * 加重平均取得単価（円）。
 * 買い履歴が無い場合は null（保有だけある外部入金などは呼び出し側で現在値フォールバック）。
 */
export function averageBuyPriceYenFromTrades(
  trades: ReadonlyArray<Pick<SolunaTradeRecord, "side" | "product" | "sizeJpy" | "priceBtc">>,
  product: SolunaTradeProduct | string,
): number | null {
  const buyTrades = trades.filter((t) => isBuyForProduct(t, product));
  if (buyTrades.length === 0) return null;
  const notional = buyTrades.reduce((s, t) => s + (t.sizeJpy ?? 0), 0);
  if (notional <= 0) return null;
  const weighted = buyTrades.reduce(
    (s, t) => s + (t.priceBtc ?? 0) * (t.sizeJpy ?? 0),
    0,
  );
  if (weighted <= 0) return null;
  return weighted / notional;
}

export type ResolvedAvgBuyPrice = {
  avgBuyPriceYen: number | null;
  /** true: 買い履歴が無く現在値を仮の取得単価にした */
  avgBuyEstimated: boolean;
};

/** 保有があるのに買い履歴が無い銘柄（例: 取引所入金の BTC）もグラフに載せる */
export function resolveAvgBuyPriceYen(input: {
  trades: ReadonlyArray<Pick<SolunaTradeRecord, "side" | "product" | "sizeJpy" | "priceBtc">>;
  product: SolunaTradeProduct | string;
  held: number;
  markPriceYen: number;
}): ResolvedAvgBuyPrice {
  const fromTrades = averageBuyPriceYenFromTrades(input.trades, input.product);
  if (fromTrades != null && Number.isFinite(fromTrades) && fromTrades > 0) {
    return { avgBuyPriceYen: fromTrades, avgBuyEstimated: false };
  }
  if (input.held > 0 && input.markPriceYen > 0) {
    return { avgBuyPriceYen: input.markPriceYen, avgBuyEstimated: true };
  }
  return { avgBuyPriceYen: null, avgBuyEstimated: false };
}
