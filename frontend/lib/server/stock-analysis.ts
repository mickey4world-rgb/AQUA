import YahooFinance from "yahoo-finance2";
import {
  fetchPriceChangeContext,
  resolveStockName,
} from "@/lib/server/stock-market";
import {
  STOCK_ATR_ACTIVE_RATIO,
  STOCK_DIP_MAX_RSI,
  STOCK_DIP_MONTH_LOOKBACK,
  STOCK_DIP_NEAR_MONTH_PCT,
  STOCK_DIP_NEAR_WEEK_PCT,
  STOCK_DIP_WEEK_LOOKBACK,
  STOCK_HARD_STOP_LOSS_RATE,
  STOCK_MOMENTUM_MIN_VOLUME_MULT,
  STOCK_PYRAMID_MIN_PROFIT_PCT,
  STOCK_RSI_OVERBOUGHT,
  STOCK_RSI_OVERSOLD,
  STOCK_SOFT_STOP_LOSS_RATE,
  STOCK_VOLUME_SPIKE_MULT,
} from "@/lib/stock-trade-constants";
import { isPerTradeLossBreached } from "@/lib/stock-guardrails";
import {
  atr,
  atrExpansionRatio,
  bollinger,
  bollingerBreakout,
  emaCross,
  emaLast,
  isPerfectOrderBull,
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
  const highs = history.map((row) => {
    const high = Number(row.high);
    return Number.isFinite(high) && high > 0 ? high : row.close;
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

  // 表示互換で SMA も残し、売買判定は EMA（直近重視・活発化）
  const ma5 = sma(closes, 5);
  const ma25 = sma(closes, Math.min(25, closes.length));
  const ema5 = emaLast(closes, 5);
  const ema25 = emaLast(closes, 25);
  const ema75 = emaLast(closes, 75);
  const ma5DeviationPct = maDeviationPct(currentPrice, ema5 > 0 ? ema5 : ma5);
  const ma25DeviationPct = maDeviationPct(currentPrice, ema25 > 0 ? ema25 : ma25);
  const rsi14 = rsi(closes, 14);
  const bb = bollinger(closes, 20, 2);
  const bbBreak = bollingerBreakout(closes, 20, 2);
  const macdSnap = macd(closes);
  const volSpike = volumeSpikeRatio(volumes, 5);
  const emaX = emaCross(closes, 5, 25);
  const perfectOrder = isPerfectOrderBull(closes, 5, 25, 75);
  const atr14 = atr(highs, lows, closes, 14);
  const atrRatio = atrExpansionRatio(highs, lows, closes, 14);
  const volumeConfirmed = volSpike >= STOCK_MOMENTUM_MIN_VOLUME_MULT;
  const atrActive = atrRatio >= STOCK_ATR_ACTIVE_RATIO;

  // 長期フィルタ=EMA75 位置、短期エントリ=EMA5/25（日足での二段近似）
  const trend =
    ema5 > ema25 && (ema75 <= 0 || currentPrice >= ema75 * 0.97)
      ? "bullish"
      : ema5 > ema25
        ? "bullish"
        : "bearish";

  const profitPct = ((currentPrice - watch.buyPrice) / watch.buyPrice) * 100;
  const distanceToTargetPct =
    ((watch.targetPrice - currentPrice) / currentPrice) * 100;

  const reasons: string[] = [];
  let action: StockAdvice["action"] = "hold";

  if (trend === "bullish") {
    reasons.push(
      `EMA5>EMA25の短期上昇（EMA5乖離 ${ma5DeviationPct.toFixed(1)}%` +
        (perfectOrder ? "・パーフェクトオーダー" : "") +
        `）。`,
    );
  } else {
    reasons.push(
      `EMA5≤EMA25の短期下降（EMA5乖離 ${ma5DeviationPct.toFixed(1)}%）。`,
    );
  }

  reasons.push(
    `RSI(14)=${rsi14.toFixed(0)} / BB幅=${(bb.widthPct * 100).toFixed(1)}%(${bbBreak.regime})` +
      ` / EMAクロス=${emaX === "none" ? "なし" : emaX === "golden" ? "ゴールデン" : "デッド"}` +
      ` / MACD=${macdSnap.cross === "none" ? "なし" : macdSnap.cross === "golden" ? "ゴールデン" : "デッド"}` +
      ` / 出来高×${volSpike.toFixed(1)} / ATR比×${atrRatio.toFixed(2)}`,
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

  // --- 利確優先。含み損の即売りはしない（損切りは保有1年超・planner側）---
  const qtyForLoss = Math.max(watch.shares || 0, 100);
  const layer1Breached = isPerTradeLossBreached({
    buyPrice: watch.buyPrice,
    currentPrice,
    qty: qtyForLoss,
  });
  if (currentPrice >= watch.targetPrice && profitPct > 0) {
    action = "sell";
    reasons.push(
      `目標株価 ${targetLabel} に到達（含み益）。利確を検討してください。`,
    );
  } else if (
    (macdSnap.cross === "dead" || emaX === "dead") &&
    profitPct > 0
  ) {
    action = "sell";
    reasons.push(
      `${emaX === "dead" ? "EMA" : "MACD"}デッドクロスかつ含み益のため、利確寄りで売り検討です。`,
    );
  } else if (distanceToTargetPct <= 5 && profitPct > 0) {
    action = "sell";
    reasons.push(
      `目標株価まであと ${distanceToTargetPct.toFixed(1)}%（含み益）。売り時を検討してください。`,
    );
  } else if (
    atrActive &&
    profitPct > 0 &&
    distanceToTargetPct <= 8 &&
    rsi14 >= STOCK_RSI_OVERBOUGHT - 5
  ) {
    // ATR拡大時は利確を早めに（損切はしない・プラス圏のみ）
    action = "sell";
    reasons.push(
      `ATR拡大(×${atrRatio.toFixed(2)})かつ含み益・RSI高めのため、動的に利確を検討します。`,
    );
  } else if (layer1Breached || profitPct / 100 <= softStopPct / 100) {
    action = "hold";
    reasons.push(
      `含み損 ${profitPct.toFixed(1)}% を監視中（損切りしない。参考閾値 ${hardStopPct}%/${softStopPct}%）。余剰・利益がない局面では保有継続。`,
    );
  } else if (rsi14 >= STOCK_RSI_OVERBOUGHT && trend === "bullish") {
    action = "watch";
    reasons.push(
      `RSI ${rsi14.toFixed(0)} ≥ ${STOCK_RSI_OVERBOUGHT}（買われすぎ）。新規買いを控え様子見です。`,
    );
  } else if (
    // EMA ゴールデン + 出来高確認（ダマシ低減）
    emaX === "golden" &&
    volumeConfirmed &&
    rsi14 < STOCK_RSI_OVERBOUGHT &&
    macdSnap.cross !== "dead"
  ) {
    action = "buy";
    reasons.push(
      `EMA5/25ゴールデンクロス＋出来高×${volSpike.toFixed(1)}（≥${STOCK_MOMENTUM_MIN_VOLUME_MULT}）で順張り買い検討。`,
    );
  } else if (
    // BB エクスパンション上抜け + 出来高
    bbBreak.up &&
    volumeConfirmed &&
    rsi14 < STOCK_RSI_OVERBOUGHT + 5
  ) {
    action = "buy";
    reasons.push(
      `ボリンジャー拡大ブレイク（上限抜け）＋出来高×${volSpike.toFixed(1)}で順張り買い検討。`,
    );
  } else if (
    perfectOrder &&
    volumeConfirmed &&
    rsi14 < STOCK_RSI_OVERBOUGHT &&
    macdSnap.cross !== "dead"
  ) {
    action = "buy";
    reasons.push(
      `パーフェクトオーダー（EMA5>25>75）＋出来高確認のため、トレンド追随の買い検討。`,
    );
  } else if (
    // 含み益中のパーフェクトオーダー＝ピラミッディング（損切ナンピンはしない）
    perfectOrder &&
    profitPct >= STOCK_PYRAMID_MIN_PROFIT_PCT &&
    watch.shares > 0 &&
    rsi14 < STOCK_RSI_OVERBOUGHT &&
    volumeConfirmed
  ) {
    action = "buy";
    reasons.push(
      `含み益 ${profitPct.toFixed(1)}%＋パーフェクトオーダーのため買い増し（ピラミッディング）を検討。`,
    );
  } else if (
    trend === "bullish" &&
    atrActive &&
    volumeConfirmed &&
    rsi14 <= STOCK_RSI_OVERBOUGHT - 5 &&
    macdSnap.cross !== "dead"
  ) {
    action = "buy";
    reasons.push(
      `上昇トレンドかつ ATR 拡大(×${atrRatio.toFixed(2)})・出来高ありのため、活発化バイアスで買い検討。`,
    );
  } else if (
    trend === "bullish" &&
    rsi14 <= STOCK_RSI_OVERSOLD &&
    macdSnap.cross !== "dead" &&
    emaX !== "dead"
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
    // 自動ナンピンは含み損を拡大しやすい → hold。損切もしない。
    action = "hold";
    reasons.push(
      `購入価格比 ${profitPct.toFixed(1)}% の含み損だが上昇トレンド。自動ナンピン・損切りはせず保有継続。`,
    );
  } else if (
    volSpike >= STOCK_VOLUME_SPIKE_MULT &&
    changePct < -1.5
  ) {
    action = "watch";
    reasons.push(
      `出来高が5日平均の ${volSpike.toFixed(1)} 倍かつ下落。需給悪化の可能性があるため見送りです。`,
    );
  } else if (
    // #8 部分解禁: 下降でも RSI 売られすぎ + 週/月安値なら押し目買い
    trend === "bearish" &&
    rsi14 <= STOCK_RSI_OVERSOLD &&
    (nearWeekLow || nearMonthLow) &&
    macdSnap.cross !== "dead" &&
    emaX !== "dead"
  ) {
    action = "buy";
    reasons.push(
      `下降トレンドだが RSI ${rsi14.toFixed(0)} ≤ ${STOCK_RSI_OVERSOLD}（売られすぎ）かつ週/月安値付近のため、押し目買いを検討できます（#8部分解禁）。`,
    );
  } else if (trend === "bearish" && profitPct > 0) {
    action = "watch";
    reasons.push(
      "含み益がありますが下降トレンドのため、利益確定または様子見が無難です。",
    );
  } else if (
    trend === "bullish" &&
    macdSnap.cross === "golden" &&
    (volumeConfirmed || atrActive)
  ) {
    action = "buy";
    reasons.push(
      "MACDゴールデンクロスと上昇トレンド" +
        (volumeConfirmed ? "・出来高確認" : "・ATR拡大") +
        "が重なり、買い検討です。",
    );
  } else if (
    // 出来高なしのクロスはスルー（ダマシ低減）
    (emaX === "golden" || macdSnap.cross === "golden") &&
    !volumeConfirmed
  ) {
    action = "watch";
    reasons.push(
      `クロスはあるが出来高×${volSpike.toFixed(1)}不足（要≥${STOCK_MOMENTUM_MIN_VOLUME_MULT}）のため見送り（ダマシ回避）。`,
    );
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
    ema5,
    ema25,
    ema75,
    emaCross: emaX,
    perfectOrder,
    atr14,
    atrRatio,
    bbRegime: bbBreak.regime,
    rsi14,
    bollingerWidthPct: bb.widthPct,
    macdCross: macdSnap.cross,
    volumeSpikeRatio: volSpike,
    volumeConfirmed,
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
