import YahooFinance from "yahoo-finance2";
import {
  fetchPriceChangeContext,
  resolveStockName,
} from "@/lib/server/stock-market";
import {
  STOCK_DIP_MAX_RSI,
  STOCK_DIP_MONTH_LOOKBACK,
  STOCK_DIP_NEAR_MONTH_PCT,
  STOCK_DIP_NEAR_WEEK_PCT,
  STOCK_DIP_WEEK_LOOKBACK,
  STOCK_HARD_STOP_LOSS_RATE,
  STOCK_RSI_OVERBOUGHT,
  STOCK_RSI_OVERSOLD,
  STOCK_SOFT_STOP_LOSS_RATE,
  STOCK_VOLUME_SPIKE_MULT,
} from "@/lib/stock-trade-constants";
import { isPerTradeLossBreached } from "@/lib/stock-guardrails";
import {
  bollinger,
  maDeviationPct,
  macd,
  rsi,
  sma,
  volumeSpikeRatio,
} from "@/lib/stock-technicals";
import { formatPrice, marketCurrency } from "@/lib/stock-utils";
import type { StockAdvice, StockWatch } from "@/lib/types/stock";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

async function fetchFundamentals(ticker: string): Promise<{
  trailingPe: number | null;
  priceToBook: number | null;
  dividendYieldPct: number | null;
}> {
  try {
    const q = await yahooFinance.quote(ticker);
    const pe = Number(q.trailingPE);
    const pb = Number(q.priceToBook);
    const dy = Number(q.trailingAnnualDividendYield ?? q.dividendYield);
    return {
      trailingPe: Number.isFinite(pe) && pe > 0 ? pe : null,
      priceToBook: Number.isFinite(pb) && pb > 0 ? pb : null,
      dividendYieldPct:
        Number.isFinite(dy) && dy > 0
          ? dy <= 1
            ? dy * 100
            : dy
          : null,
    };
  } catch {
    return { trailingPe: null, priceToBook: null, dividendYieldPct: null };
  }
}

export async function analyzeStock(watch: StockWatch): Promise<StockAdvice> {
  const market = watch.market ?? "us";
  const currency = marketCurrency(market);
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);

  const [history, priceChangeContext, companyName, fundamentals] =
    await Promise.all([
      yahooFinance.historical(watch.ticker, {
        period1: start,
        period2: end,
      }),
      fetchPriceChangeContext(watch.ticker, market).catch(() => []),
      watch.name
        ? Promise.resolve(watch.name)
        : resolveStockName(watch.ticker, market).catch(() => null),
      fetchFundamentals(watch.ticker),
    ]);

  if (!history || history.length < 2) {
    throw new Error(`${watch.ticker} の株価データを取得できませんでした`);
  }

  const closes = history.map((row) => row.close);
  const lows = history.map((row) => {
    const low = Number(row.low);
    return Number.isFinite(low) && low > 0 ? low : row.close;
  });
  const volumes = history.map((row) => Number(row.volume ?? 0));
  const latest = history[history.length - 1]!;
  const previous = history[history.length - 2]!;

  const currentPrice = latest.close;
  const previousClose = previous.close;
  const changePct = ((currentPrice - previousClose) / previousClose) * 100;

  const weekSlice = lows.slice(-STOCK_DIP_WEEK_LOOKBACK);
  const monthSlice = lows.slice(-STOCK_DIP_MONTH_LOOKBACK);
  const weekLow = weekSlice.length ? Math.min(...weekSlice) : currentPrice;
  const monthLow = monthSlice.length ? Math.min(...monthSlice) : currentPrice;
  const nearWeekLow =
    weekLow > 0 && currentPrice <= weekLow * (1 + STOCK_DIP_NEAR_WEEK_PCT);
  const nearMonthLow =
    monthLow > 0 && currentPrice <= monthLow * (1 + STOCK_DIP_NEAR_MONTH_PCT);
  const weekProximity =
    weekLow > 0
      ? Math.max(0, 1 - (currentPrice - weekLow) / (weekLow * STOCK_DIP_NEAR_WEEK_PCT || 1))
      : 0;
  const monthProximity =
    monthLow > 0
      ? Math.max(
          0,
          1 - (currentPrice - monthLow) / (monthLow * STOCK_DIP_NEAR_MONTH_PCT || 1),
        )
      : 0;

  const ma5 = sma(closes, 5);
  const ma25 = sma(closes, Math.min(25, closes.length));
  const ma5DeviationPct = maDeviationPct(currentPrice, ma5);
  const ma25DeviationPct = maDeviationPct(currentPrice, ma25);
  const rsi14 = rsi(closes, 14);
  const bb = bollinger(closes, 20, 2);
  const macdSnap = macd(closes);
  const volSpike = volumeSpikeRatio(volumes, 5);

  const trend = ma5 > ma25 ? "bullish" : "bearish";

  const profitPct = ((currentPrice - watch.buyPrice) / watch.buyPrice) * 100;
  const distanceToTargetPct =
    ((watch.targetPrice - currentPrice) / currentPrice) * 100;

  const reasons: string[] = [];
  let action: StockAdvice["action"] = "hold";

  if (trend === "bullish") {
    reasons.push(
      `5日移動平均が25日移動平均を上回っており、短期上昇トレンドです（MA5乖離 ${ma5DeviationPct.toFixed(1)}%）。`,
    );
  } else {
    reasons.push(
      `5日移動平均が25日移動平均を下回っており、短期下降トレンドです（MA5乖離 ${ma5DeviationPct.toFixed(1)}%）。`,
    );
  }

  reasons.push(
    `RSI(14)=${rsi14.toFixed(0)} / BB幅=${(bb.widthPct * 100).toFixed(1)}% / MACD=${macdSnap.cross === "none" ? "クロスなし" : macdSnap.cross === "golden" ? "ゴールデンクロス" : "デッドクロス"} / 出来高倍率×${volSpike.toFixed(1)}`,
  );

  if (fundamentals.trailingPe != null || fundamentals.priceToBook != null) {
    const bits = [
      fundamentals.trailingPe != null
        ? `PER ${fundamentals.trailingPe.toFixed(1)}`
        : null,
      fundamentals.priceToBook != null
        ? `PBR ${fundamentals.priceToBook.toFixed(2)}`
        : null,
      fundamentals.dividendYieldPct != null
        ? `配当利回り ${fundamentals.dividendYieldPct.toFixed(2)}%`
        : null,
    ].filter(Boolean);
    if (bits.length) reasons.push(`ファンダ（参考）: ${bits.join(" / ")}`);
  }

  const targetLabel = formatPrice(watch.targetPrice, market);
  const hardStopPct = STOCK_HARD_STOP_LOSS_RATE * 100;
  const softStopPct = STOCK_SOFT_STOP_LOSS_RATE * 100;

  // --- 優先: 第1層/硬損切り → 目標利確 ---
  const qtyForLoss = Math.max(watch.shares || 0, 100);
  if (
    isPerTradeLossBreached({
      buyPrice: watch.buyPrice,
      currentPrice,
      qty: qtyForLoss,
    })
  ) {
    action = "sell";
    reasons.push(
      `第1層/ハード損切り: 含み損が上限到達、または取得比 ${profitPct.toFixed(1)}% ≤ ${hardStopPct}%。`,
    );
  } else if (currentPrice >= watch.targetPrice) {
    action = "sell";
    reasons.push(
      `目標株価 ${targetLabel} に到達しました。利確（売り）を検討してください。`,
    );
  } else if (macdSnap.cross === "dead" && profitPct > 0) {
    action = "sell";
    reasons.push("MACDデッドクロスかつ含み益のため、利確寄りで売り検討です。");
  } else if (distanceToTargetPct <= 5) {
    action = "sell";
    reasons.push(
      `目標株価まであと ${distanceToTargetPct.toFixed(1)}% です。売り時を検討してください。`,
    );
  } else if (
    profitPct / 100 <= STOCK_SOFT_STOP_LOSS_RATE &&
    trend === "bearish"
  ) {
    action = "sell";
    reasons.push(
      `購入価格比 ${profitPct.toFixed(1)}%（ソフト損切 ${softStopPct}%付近）で下降トレンドです。`,
    );
  } else if (rsi14 >= STOCK_RSI_OVERBOUGHT && trend === "bullish") {
    action = "watch";
    reasons.push(
      `RSI ${rsi14.toFixed(0)} ≥ ${STOCK_RSI_OVERBOUGHT}（買われすぎ）。新規買いを控え様子見です。`,
    );
  } else if (
    trend === "bullish" &&
    rsi14 <= STOCK_RSI_OVERSOLD &&
    macdSnap.cross !== "dead"
  ) {
    action = "buy";
    reasons.push(
      `RSI ${rsi14.toFixed(0)} ≤ ${STOCK_RSI_OVERSOLD}（売られすぎ）かつ上昇トレンドのため、押し目買いを検討できます。`,
    );
  } else if (
    profitPct <= -5 &&
    trend === "bullish" &&
    rsi14 < STOCK_RSI_OVERBOUGHT
  ) {
    action = "buy";
    reasons.push(
      `購入価格比 ${profitPct.toFixed(1)}% ですが上昇トレンドのため、ナンピン（追加買い）を検討できます。`,
    );
  } else if (
    volSpike >= STOCK_VOLUME_SPIKE_MULT &&
    changePct < -1.5
  ) {
    action = "watch";
    reasons.push(
      `出来高が5日平均の ${volSpike.toFixed(1)} 倍かつ下落。需給悪化の可能性があるため見送りです。`,
    );
  } else if (trend === "bearish" && profitPct > 0) {
    action = "watch";
    reasons.push(
      "含み益がありますが下降トレンドのため、利益確定または様子見が無難です。",
    );
  } else if (trend === "bullish" && macdSnap.cross === "golden") {
    action = "buy";
    reasons.push("MACDゴールデンクロスと上昇トレンドが重なり、買い検討です。");
  } else {
    action = "hold";
    reasons.push("大きな売買シグナルはありません。保有継続が妥当です。");
  }

  const earningsNews = priceChangeContext.some((n) =>
    /決算|earnings|guidance|業績/i.test(n.title),
  );
  if (earningsNews && action === "buy") {
    action = "watch";
    reasons.push(
      "直近ニュースに決算・業績関連があるため、新規買いは見送り（イベント回避）。",
    );
  }

  // 安値ゾーン（週次/月次）: 解説用メモ＋自動売買の別経路候補。
  // action は従来ロジックを維持し、dipBuyEligible で「安値拾い」を別枠にする。
  const crashVolume =
    volSpike >= STOCK_VOLUME_SPIKE_MULT && changePct < -1.5;
  let dipScore = 0;
  if (nearWeekLow || nearMonthLow) {
    dipScore =
      Math.round(monthProximity * 50) +
      Math.round(weekProximity * 30) +
      Math.round(Math.max(0, Math.min(20, STOCK_DIP_MAX_RSI - rsi14)));
    if (macdSnap.cross === "dead") dipScore -= 15;
    if (changePct < -3) dipScore -= 10;
    dipScore = Math.max(0, dipScore);
    reasons.push(
      `安値ゾーン: 週安値比 ${(((currentPrice - weekLow) / weekLow) * 100).toFixed(1)}%` +
        ` / 月安値比 ${(((currentPrice - monthLow) / monthLow) * 100).toFixed(1)}%` +
        `（スコア ${dipScore}）。自動売買はウォッチ数に対する割合枠まで別枠採用（残りは従来条件）。`,
    );
  }
  // 未保有(shares=0)のときの action=sell は取得単価メモ由来の損切り表示であり、
  // 新規の安値ゾーン買いをブロックしない。保有中の売り推奨だけ除外する。
  const dipBuyEligible =
    market === "jp" &&
    !(action === "sell" && watch.shares > 0) &&
    !earningsNews &&
    !crashVolume &&
    rsi14 <= STOCK_DIP_MAX_RSI &&
    (nearWeekLow || nearMonthLow) &&
    dipScore > 0;

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
    ma5DeviationPct,
    ma25DeviationPct,
    rsi14,
    bollingerWidthPct: bb.widthPct,
    macdCross: macdSnap.cross,
    volumeSpikeRatio: volSpike,
    trailingPe: fundamentals.trailingPe,
    priceToBook: fundamentals.priceToBook,
    dividendYieldPct: fundamentals.dividendYieldPct,
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
    nearWeekLow,
    nearMonthLow,
    dipBuyEligible,
    dipScore,
  };
}
