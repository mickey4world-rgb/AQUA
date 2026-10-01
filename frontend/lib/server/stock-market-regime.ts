/**
 * 市場環境（地合い）— Yahoo 指数から取得。買いゲート用。
 */
import YahooFinance from "yahoo-finance2";
import {
  STOCK_VIX_BUY_BLOCK,
} from "@/lib/stock-trade-constants";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export type StockMarketRegime = {
  nikkeiChangePct: number | null;
  spxChangePct: number | null;
  nasdaqChangePct: number | null;
  vix: number | null;
  usdjpyChangePct: number | null;
  /** VIX が閾値以上 → 新規買い禁止 */
  blockBuys: boolean;
  blockReason?: string;
  notes: string[];
  fetchedAt: string;
};

async function quoteChangePct(symbol: string): Promise<number | null> {
  try {
    const q = await yahooFinance.quote(symbol);
    const price = Number(q.regularMarketPrice ?? 0);
    const prev = Number(q.regularMarketPreviousClose ?? 0);
    if (price > 0 && prev > 0) return ((price - prev) / prev) * 100;
    const ch = Number(q.regularMarketChangePercent);
    return Number.isFinite(ch) ? ch : null;
  } catch {
    return null;
  }
}

async function quoteLast(symbol: string): Promise<number | null> {
  try {
    const q = await yahooFinance.quote(symbol);
    const v = Number(q.regularMarketPrice ?? q.regularMarketPreviousClose);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

let cache: { at: number; value: StockMarketRegime } | null = null;
const CACHE_MS = 5 * 60_000;

export async function getStockMarketRegime(): Promise<StockMarketRegime> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const [nikkeiChangePct, spxChangePct, nasdaqChangePct, vix, usdjpyChangePct] =
    await Promise.all([
      quoteChangePct("^N225"),
      quoteChangePct("^GSPC"),
      quoteChangePct("^IXIC"),
      quoteLast("^VIX"),
      quoteChangePct("USDJPY=X"),
    ]);

  const notes: string[] = [];
  if (nikkeiChangePct != null) {
    notes.push(`日経平均 前日比 ${nikkeiChangePct >= 0 ? "+" : ""}${nikkeiChangePct.toFixed(2)}%`);
  }
  if (vix != null) notes.push(`VIX ${vix.toFixed(1)}`);
  if (usdjpyChangePct != null) {
    notes.push(`USD/JPY 前日比 ${usdjpyChangePct >= 0 ? "+" : ""}${usdjpyChangePct.toFixed(2)}%`);
  }

  let blockBuys = false;
  let blockReason: string | undefined;
  if (vix != null && vix >= STOCK_VIX_BUY_BLOCK) {
    blockBuys = true;
    blockReason = `VIX ${vix.toFixed(1)} ≥ ${STOCK_VIX_BUY_BLOCK}（恐怖指数・新規買い見送り）`;
  } else if (nikkeiChangePct != null && nikkeiChangePct <= -2.5) {
    blockBuys = true;
    blockReason = `日経平均 前日比 ${nikkeiChangePct.toFixed(2)}%（急落地合い・新規買い見送り）`;
  }

  const value: StockMarketRegime = {
    nikkeiChangePct,
    spxChangePct,
    nasdaqChangePct,
    vix,
    usdjpyChangePct,
    blockBuys,
    blockReason,
    notes,
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), value };
  return value;
}
