import YahooFinance from "yahoo-finance2";
import {
  fetchPriceChangeContext,
  resolveStockName,
} from "@/lib/server/stock-market";
import { formatPrice, marketCurrency } from "@/lib/stock-utils";
import type { StockAdvice, StockWatch } from "@/lib/types/stock";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function analyzeStock(watch: StockWatch): Promise<StockAdvice> {
  const market = watch.market ?? "us";
  const currency = marketCurrency(market);
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);

  const [history, priceChangeContext, companyName] = await Promise.all([
    yahooFinance.historical(watch.ticker, {
      period1: start,
      period2: end,
    }),
    fetchPriceChangeContext(watch.ticker, market).catch(() => []),
    watch.name
      ? Promise.resolve(watch.name)
      : resolveStockName(watch.ticker, market).catch(() => null),
  ]);

  if (!history || history.length < 2) {
    throw new Error(`${watch.ticker} の株価データを取得できませんでした`);
  }

  const closes = history.map((row) => row.close);
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  const currentPrice = latest.close;
  const previousClose = previous.close;
  const changePct = ((currentPrice - previousClose) / previousClose) * 100;

  const ma5 = average(closes.slice(-5));
  const ma25 = average(closes.slice(-25));
  const trend = ma5 > ma25 ? "bullish" : "bearish";

  const profitPct = ((currentPrice - watch.buyPrice) / watch.buyPrice) * 100;
  const distanceToTargetPct =
    ((watch.targetPrice - currentPrice) / currentPrice) * 100;

  const reasons: string[] = [];
  let action: StockAdvice["action"] = "hold";

  if (trend === "bullish") {
    reasons.push("5日移動平均が25日移動平均を上回っており、短期上昇トレンドです。");
  } else {
    reasons.push("5日移動平均が25日移動平均を下回っており、短期下降トレンドです。");
  }

  const targetLabel = formatPrice(watch.targetPrice, market);

  if (currentPrice >= watch.targetPrice) {
    action = "sell";
    reasons.push(
      `目標株価 ${targetLabel} に到達しました。利確（売り）を検討してください。`,
    );
  } else if (distanceToTargetPct <= 5) {
    action = "sell";
    reasons.push(
      `目標株価まであと ${distanceToTargetPct.toFixed(1)}% です。売り時を検討してください。`,
    );
  } else if (profitPct <= -10 && trend === "bearish") {
    action = "sell";
    reasons.push(
      `購入価格比 ${profitPct.toFixed(1)}% の含み損で下降トレンドです。損切りまたは様子見を検討してください。`,
    );
  } else if (profitPct <= -5 && trend === "bullish") {
    action = "buy";
    reasons.push(
      `購入価格比 ${profitPct.toFixed(1)}% ですが上昇トレンドのため、ナンピン（追加買い）を検討できます。`,
    );
  } else if (trend === "bearish" && profitPct > 0) {
    action = "watch";
    reasons.push(
      "含み益がありますが下降トレンドのため、利益確定または様子見が無難です。",
    );
  } else {
    action = "hold";
    reasons.push("大きな売買シグナルはありません。保有継続が妥当です。");
  }

  const actionLabel = {
    hold: "保有継続",
    buy: "買い検討",
    sell: "売り検討",
    watch: "様子見",
  }[action];

  const displayName = companyName ?? watch.ticker;
  const priceLabel = formatPrice(currentPrice, market);
  const summary = `${displayName} (${watch.ticker}): ${actionLabel}（${priceLabel} / 損益 ${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(1)}%）`;

  return {
    ticker: watch.ticker,
    market,
    currency,
    companyName: companyName ?? undefined,
    currentPrice,
    previousClose,
    changePct,
    ma5,
    ma25,
    trend,
    buyPrice: watch.buyPrice,
    targetPrice: watch.targetPrice,
    profitPct,
    distanceToTargetPct,
    action,
    summary,
    reasons,
    priceChangeContext,
    fetchedAt: new Date().toISOString(),
  };
}
