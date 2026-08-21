/**
 * bitFlyer Lightning API クライアント + Soluna 資産運用ロジック
 *
 * 運用ルール:
 *   1. 1回の取引は最大 10,000 円（確信度でサイズ可変）
 *   2. 利確 / 損切りは市場モメンタムに応じて動的（硬い上限: +4% / -3%）
 *   3. 月次目標は月初残高×2%。おやすみモードは実現損益が月初残高×10%を超えたら新規購入停止
 *   4. 裏稼働: リアルタイム板・約定・スプレッドから利益見込みを見て売買
 */

import crypto from "crypto";
import type {
  SolunaAssetLedger,
  SolunaMonthlyAssetSummary,
  SolunaTradeRecord,
} from "@/lib/types/soluna";
import { medalUnitScore } from "@/lib/server/soluna-battle";
import type { SolunaHunterState } from "@/lib/types/soluna";
import { resolveBattleMode } from "@/lib/server/soluna-asset-rpg";

// ── 定数 ─────────────────────────────────────────────────────────────────────

export const ASSET_PRINCIPAL_YEN = 100_000;
const MAX_TRADE_YEN = 10_000;
const HARD_TAKE_PROFIT_RATE = 0.04;
const SOFT_TAKE_PROFIT_RATE = 0.025;
const HARD_STOP_LOSS_RATE = -0.03;
const SOFT_STOP_LOSS_RATE = -0.02;
const MONTHLY_TARGET_RATE = 0.02;
/** おやすみモード閾値（月初残高比）。目標2%とは別に、10%超で新規購入停止 */
const SLEEP_MODE_RATE = 0.1;
const MIN_BTC_ORDER = 0.0001;
const BUY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 市場が良いとき再エントリーしやすく 2h
const MAX_DAILY_BUY_YEN = 20_000;
const MAX_SPREAD_BPS = 12; // スプレッドが広すぎるときは見送り
const BULLISH_SCORE = 28;
const STRONG_BULLISH_SCORE = 55;

// ── bitFlyer API ──────────────────────────────────────────────────────────────

function isBitFlyerConfigured(): boolean {
  return Boolean(process.env.BITFLYER_API_KEY?.trim() && process.env.BITFLYER_API_SECRET?.trim());
}

export function isBitFlyerEnabled(): boolean {
  return isBitFlyerConfigured();
}

function bitFlyerSign(timestamp: number, method: string, path: string, body: string): string {
  const text = `${timestamp}${method}${path}${body}`;
  return crypto
    .createHmac("sha256", process.env.BITFLYER_API_SECRET!)
    .update(text)
    .digest("hex");
}

async function bitFlyerFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: object,
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const sign = bitFlyerSign(timestamp, method, path, bodyStr);

  const res = await fetch(`https://api.bitflyer.com${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "ACCESS-KEY": process.env.BITFLYER_API_KEY!,
      "ACCESS-TIMESTAMP": String(timestamp),
      "ACCESS-SIGN": sign,
    },
    body: bodyStr || undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`bitFlyer API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

/** 公開市場データ（署名なし） */
async function bitFlyerPublicGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.bitflyer.com${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`bitFlyer public API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ── 市場データ ──────────────────────────────────────────────────────────────

type BfTicker = {
  ltp: number;
  best_bid: number;
  best_ask: number;
  best_bid_size?: number;
  best_ask_size?: number;
  total_bid_depth?: number;
  total_ask_depth?: number;
  volume?: number;
  timestamp?: string;
};

type BfBoardLevel = { price: number; size: number };
type BfBoard = {
  mid_price: number;
  bids: BfBoardLevel[];
  asks: BfBoardLevel[];
};

type BfExecution = {
  id: number;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  exec_date: string;
};

export type MarketPulse = {
  ltp: number;
  spreadBps: number;
  imbalance: number;
  momentumPct: number;
  buyPressure: number;
  volatilityPct: number;
  score: number;
  bias: "bullish" | "bearish" | "neutral";
  summary: string;
};

export async function getBtcPrice(): Promise<number> {
  const ticker = await bitFlyerPublicGet<BfTicker>("/v1/ticker?product_code=BTC_JPY");
  return ticker.ltp;
}

export async function getEthPrice(): Promise<number> {
  try {
    const ticker = await bitFlyerPublicGet<BfTicker>("/v1/ticker?product_code=ETH_JPY");
    return ticker.ltp;
  } catch {
    return 0;
  }
}

/**
 * 板・約定・スプレッドから「いま利益が出そうか」を数値化する
 */
export async function fetchBtcMarketPulse(): Promise<MarketPulse> {
  const [ticker, board, executions] = await Promise.all([
    bitFlyerPublicGet<BfTicker>("/v1/ticker?product_code=BTC_JPY"),
    bitFlyerPublicGet<BfBoard>("/v1/board?product_code=BTC_JPY"),
    bitFlyerPublicGet<BfExecution[]>("/v1/executions?product_code=BTC_JPY&count=80"),
  ]);

  const mid =
    ticker.best_bid > 0 && ticker.best_ask > 0
      ? (ticker.best_bid + ticker.best_ask) / 2
      : ticker.ltp;
  const spreadBps = mid > 0 ? ((ticker.best_ask - ticker.best_bid) / mid) * 10_000 : 99;

  const topBids = (board.bids ?? []).slice(0, 12);
  const topAsks = (board.asks ?? []).slice(0, 12);
  const bidDepth = topBids.reduce((s, x) => s + x.size, 0) || ticker.total_bid_depth || 0;
  const askDepth = topAsks.reduce((s, x) => s + x.size, 0) || ticker.total_ask_depth || 0;
  const depthSum = bidDepth + askDepth;
  const imbalance = depthSum > 0 ? (bidDepth - askDepth) / depthSum : 0;

  const prices = (executions ?? []).map((e) => e.price).filter((p) => p > 0);
  const newest = prices[0] ?? ticker.ltp;
  const oldest = prices[prices.length - 1] ?? ticker.ltp;
  const momentumPct = oldest > 0 ? (newest - oldest) / oldest : 0;
  const hi = prices.length ? Math.max(...prices) : ticker.ltp;
  const lo = prices.length ? Math.min(...prices) : ticker.ltp;
  const volatilityPct = mid > 0 ? (hi - lo) / mid : 0;

  let buyVol = 0;
  let sellVol = 0;
  for (const e of executions ?? []) {
    if (e.side === "BUY") buyVol += e.size;
    else sellVol += e.size;
  }
  const flowSum = buyVol + sellVol;
  const buyPressure = flowSum > 0 ? buyVol / flowSum : 0.5;

  let score = 0;
  score += Math.max(-40, Math.min(40, momentumPct * 2500));
  score += (buyPressure - 0.5) * 80;
  score += imbalance * 35;
  if (spreadBps > MAX_SPREAD_BPS) score -= Math.min(25, (spreadBps - MAX_SPREAD_BPS) * 2);
  if (volatilityPct > 0.012) score -= 8;
  score = Math.round(Math.max(-100, Math.min(100, score)));

  const bias: MarketPulse["bias"] =
    score >= BULLISH_SCORE ? "bullish" : score <= -BULLISH_SCORE ? "bearish" : "neutral";

  const summary = [
    `LTP ${Math.round(ticker.ltp).toLocaleString()}円`,
    `モメ ${momentumPct >= 0 ? "+" : ""}${(momentumPct * 100).toFixed(2)}%`,
    `買い圧 ${(buyPressure * 100).toFixed(0)}%`,
    `板偏り ${imbalance >= 0 ? "+" : ""}${(imbalance * 100).toFixed(0)}%`,
    `ｽﾌﾟ ${spreadBps.toFixed(1)}bps`,
    `予測スコア ${score}`,
  ].join(" / ");

  return {
    ltp: ticker.ltp,
    spreadBps,
    imbalance,
    momentumPct,
    buyPressure,
    volatilityPct,
    score,
    bias,
    summary,
  };
}

type BfBalance = { currency_code: string; amount: number; available: number };

export async function getBitFlyerBalance(): Promise<{
  cashYen: number;
  btcHeld: number;
  ethHeld: number;
}> {
  const balances = await bitFlyerFetch<BfBalance[]>("GET", "/v1/me/getbalance");
  const jpy = balances.find((b) => b.currency_code === "JPY");
  const btc = balances.find((b) => b.currency_code === "BTC");
  const eth = balances.find((b) => b.currency_code === "ETH");
  return {
    cashYen: jpy?.available ?? 0,
    btcHeld: btc?.available ?? 0,
    ethHeld: eth?.available ?? 0,
  };
}

// ── 注文 ─────────────────────────────────────────────────────────────────────

type BfOrderResponse = { child_order_acceptance_id: string };

async function sendOrder(side: "BUY" | "SELL", sizeJpy: number, priceYen: number): Promise<string> {
  const sizeBtc = Math.max(MIN_BTC_ORDER, Math.floor((sizeJpy / priceYen) * 10000) / 10000);
  const order = await bitFlyerFetch<BfOrderResponse>("POST", "/v1/me/sendchildorder", {
    product_code: "BTC_JPY",
    child_order_type: "MARKET",
    side,
    size: sizeBtc,
    minute_to_expire: 10,
    time_in_force: "GTC",
  });
  return order.child_order_acceptance_id;
}

// ── 売買判断ロジック ──────────────────────────────────────────────────────────

function jstMonthStr(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7);
}

function sleepModeThresholdYen(ledger: Pick<SolunaAssetLedger, "lastMonthTotalYen" | "principalYen">): number {
  const base = ledger.lastMonthTotalYen || ledger.principalYen || ASSET_PRINCIPAL_YEN;
  return Math.round(base * SLEEP_MODE_RATE);
}

function isSleepModeActive(
  monthlyPnlYen: number,
  ledger: Pick<SolunaAssetLedger, "lastMonthTotalYen" | "principalYen">,
): boolean {
  return monthlyPnlYen >= sleepModeThresholdYen(ledger);
}

function buildInitialLedger(medalUnits: number): SolunaAssetLedger {
  const now = new Date().toISOString();
  const targetYen = Math.round(ASSET_PRINCIPAL_YEN * MONTHLY_TARGET_RATE);
  return {
    principalYen: ASSET_PRINCIPAL_YEN,
    lastMonthTotalYen: ASSET_PRINCIPAL_YEN,
    monthlyTargetYen: targetYen,
    monthlyRealizedPnlYen: 0,
    sleepMode: false,
    btcHeld: 0,
    ethHeld: 0,
    cashYen: ASSET_PRINCIPAL_YEN,
    totalYen: ASSET_PRINCIPAL_YEN,
    previousTotalYen: ASSET_PRINCIPAL_YEN,
    previousBtcValueYen: 0,
    previousCashYen: ASSET_PRINCIPAL_YEN,
    btcPriceYen: 0,
    ethPriceYen: 0,
    battleMode: "defense",
    trades: [],
    monthlySummaries: [],
    medalUnits,
    status: "waiting-spec",
    solComment: "聖なる魔力タンクへの充填を待っている。届き次第、雷轟の蒼竜を召喚する！",
    lunaComment: "入金確認まで待機。ルールは決まった、あとは実行するだけ。",
    updatedAt: now,
  };
}

function rolloverMonthIfNeeded(ledger: SolunaAssetLedger): SolunaAssetLedger {
  const currentMonth = jstMonthStr();
  const summaries = ledger.monthlySummaries ?? [];
  const lastSummary = summaries[summaries.length - 1];

  if (lastSummary?.month === currentMonth) return ledger;

  const newSummaries: SolunaMonthlyAssetSummary[] = [...summaries];
  if (lastSummary && lastSummary.month !== currentMonth) {
    newSummaries[newSummaries.length - 1] = {
      ...lastSummary,
      realizedPnlYen: ledger.monthlyRealizedPnlYen,
      goalReached: ledger.monthlyRealizedPnlYen >= ledger.monthlyTargetYen,
    };
  }

  const openingBalance = ledger.totalYen;
  const targetYen = Math.round(openingBalance * MONTHLY_TARGET_RATE);
  newSummaries.push({
    month: currentMonth,
    openingBalanceYen: openingBalance,
    targetProfitYen: targetYen,
    realizedPnlYen: 0,
    goalReached: false,
  });

  return {
    ...ledger,
    lastMonthTotalYen: openingBalance,
    monthlyTargetYen: targetYen,
    monthlyRealizedPnlYen: 0,
    sleepMode: false,
    monthlySummaries: newSummaries.slice(-13),
  };
}

type TradeDecision =
  | { action: "BUY"; reason: string; amountJpy: number; tradeReason: SolunaTradeRecord["reason"] }
  | { action: "SELL"; reason: string; tradeReason: "take-profit" | "stop-loss" }
  | { action: "HOLD"; reason: string };

function jstDayKey(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function lastBuyTrade(ledger: SolunaAssetLedger): SolunaTradeRecord | null {
  const buys = ledger.trades.filter((t) => t.side === "BUY");
  return buys.length > 0 ? buys[buys.length - 1]! : null;
}

function boughtYenOnJstDay(ledger: SolunaAssetLedger, dayKey: string): number {
  return ledger.trades
    .filter((t) => t.side === "BUY" && jstDayKey(new Date(t.createdAt)) === dayKey)
    .reduce((sum, t) => sum + t.sizeJpy, 0);
}

function averageBuyPrice(ledger: SolunaAssetLedger): number | null {
  const buyTrades = ledger.trades.filter((t) => t.side === "BUY");
  if (buyTrades.length === 0) return null;
  const notional = buyTrades.reduce((s, t) => s + t.sizeJpy, 0);
  if (notional <= 0) return null;
  return buyTrades.reduce((s, t) => s + t.priceBtc * t.sizeJpy, 0) / notional;
}

/**
 * リアルタイム市場パルス＋保有状況から、利益が出そうな範囲で売買判断する
 */
function decideTrade(
  ledger: SolunaAssetLedger,
  pulse: MarketPulse,
  newsSentiment: "positive" | "negative" | "neutral",
  battleMode: "attack" | "defense",
): TradeDecision {
  const btcPrice = pulse.ltp;

  if (isSleepModeActive(ledger.monthlyRealizedPnlYen, ledger)) {
    return {
      action: "HOLD",
      reason: `月次おやすみ閾値（10%）達成済み｜${pulse.summary}`,
    };
  }

  if (ledger.btcHeld > MIN_BTC_ORDER) {
    const avgBuyPrice = averageBuyPrice(ledger);
    if (avgBuyPrice) {
      const changeRate = (btcPrice - avgBuyPrice) / avgBuyPrice;
      const fading = pulse.score < 0 || pulse.bias === "bearish";
      const acceleratingDown = pulse.score <= -BULLISH_SCORE && pulse.momentumPct < 0;

      if (changeRate >= HARD_TAKE_PROFIT_RATE) {
        return {
          action: "SELL",
          tradeReason: "take-profit",
          reason: `硬利確 +${(changeRate * 100).toFixed(1)}%｜${pulse.summary}`,
        };
      }
      if (changeRate >= SOFT_TAKE_PROFIT_RATE && fading) {
        return {
          action: "SELL",
          tradeReason: "take-profit",
          reason: `勢い減衰で早め利確 +${(changeRate * 100).toFixed(1)}%｜${pulse.summary}`,
        };
      }
      if (changeRate <= HARD_STOP_LOSS_RATE) {
        return {
          action: "SELL",
          tradeReason: "stop-loss",
          reason: `硬損切り ${(changeRate * 100).toFixed(1)}%｜${pulse.summary}`,
        };
      }
      if (changeRate <= SOFT_STOP_LOSS_RATE && acceleratingDown) {
        return {
          action: "SELL",
          tradeReason: "stop-loss",
          reason: `下落加速のため早め損切り ${(changeRate * 100).toFixed(1)}%｜${pulse.summary}`,
        };
      }
    }
  }

  if (pulse.spreadBps > MAX_SPREAD_BPS) {
    return {
      action: "HOLD",
      reason: `スプレッド ${pulse.spreadBps.toFixed(1)}bps が広いため見送り｜${pulse.summary}`,
    };
  }

  const lastBuy = lastBuyTrade(ledger);
  if (lastBuy) {
    const elapsed = Date.now() - new Date(lastBuy.createdAt).getTime();
    if (elapsed < BUY_COOLDOWN_MS) {
      const remainH = ((BUY_COOLDOWN_MS - elapsed) / 3_600_000).toFixed(1);
      return {
        action: "HOLD",
        reason: `エントリー冷却中（あと約 ${remainH}h）。利確監視は継続｜${pulse.summary}`,
      };
    }
  }

  const todayBought = boughtYenOnJstDay(ledger, jstDayKey());
  const dailyBuyRoom = MAX_DAILY_BUY_YEN - todayBought;
  if (dailyBuyRoom < 1000) {
    return {
      action: "HOLD",
      reason: `本日の購入枠を消化済み。利確・損切りのみ継続｜${pulse.summary}`,
    };
  }

  if (ledger.cashYen < 1000) {
    return { action: "HOLD", reason: `現金不足。監視のみ｜${pulse.summary}` };
  }

  let buyThreshold = BULLISH_SCORE;
  if (battleMode === "defense") buyThreshold += 12;
  if (newsSentiment === "negative") buyThreshold += 10;
  if (newsSentiment === "positive") buyThreshold -= 6;
  if (battleMode === "attack") buyThreshold -= 5;

  if (pulse.score < buyThreshold || pulse.bias !== "bullish") {
    return {
      action: "HOLD",
      reason: `利益見込み不足（スコア ${pulse.score} < 閾値 ${buyThreshold}）｜${pulse.summary}`,
    };
  }

  const conviction =
    pulse.score >= STRONG_BULLISH_SCORE ? 1 : 0.45 + ((pulse.score - buyThreshold) / 80) * 0.55;
  const amountJpy = Math.max(
    1000,
    Math.min(
      MAX_TRADE_YEN,
      Math.round(ledger.cashYen),
      dailyBuyRoom,
      Math.round(MAX_TRADE_YEN * conviction),
    ),
  );

  return {
    action: "BUY",
    tradeReason: "dca",
    amountJpy,
    reason: `市場強気エントリー ${amountJpy.toLocaleString()}円（確信度 ${(conviction * 100).toFixed(0)}%）｜${pulse.summary}`,
  };
}

export function inferNewsSentiment(summary: string): "positive" | "negative" | "neutral" {
  const pos = ["上昇", "回復", "成長", "好調", "利上げ", "強い", "楽観", "期待", "拡大", "増加"];
  const neg = ["下落", "懸念", "暴落", "リスク", "不安", "悪化", "縮小", "減少", "警戒", "危機", "紛争"];
  const text = summary.toLowerCase();
  const posScore = pos.filter((w) => text.includes(w)).length;
  const negScore = neg.filter((w) => text.includes(w)).length;
  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

// ── メインの実行関数 ──────────────────────────────────────────────────────────

export async function runDailyAssetTrade(input: {
  ledger: SolunaAssetLedger | null;
  hunter: SolunaHunterState;
  newsSummary: string;
  briefingId: string;
}): Promise<SolunaAssetLedger> {
  const medalUnits = medalUnitScore(input.hunter.medals);

  if (!isBitFlyerEnabled()) {
    const base = input.ledger ?? buildInitialLedger(medalUnits);
    return {
      ...base,
      medalUnits,
      status: "waiting-spec",
      solComment:
        "聖なる魔力タンクの接続呪文がまだ届いていない。ギルド金庫の同期設定を待っている！",
      lunaComment:
        "魔力タンクのAPI接続が未設定よ。設定が来たら市場を見て即動くわ。取引所の名前は外に出さないこと。",
      updatedAt: new Date().toISOString(),
    };
  }

  const [balance, pulse, ethPrice] = await Promise.all([
    getBitFlyerBalance(),
    fetchBtcMarketPulse(),
    getEthPrice(),
  ]);
  const btcPrice = pulse.ltp;
  const totalYen = Math.round(
    balance.cashYen + balance.btcHeld * btcPrice + balance.ethHeld * ethPrice,
  );

  let ledger = input.ledger
    ? {
        ...buildInitialLedger(medalUnits),
        ...input.ledger,
        ethHeld: input.ledger.ethHeld ?? 0,
        ethPriceYen: input.ledger.ethPriceYen ?? 0,
        previousTotalYen: input.ledger.previousTotalYen ?? input.ledger.totalYen ?? ASSET_PRINCIPAL_YEN,
        previousBtcValueYen: input.ledger.previousBtcValueYen ?? 0,
        previousCashYen: input.ledger.previousCashYen ?? input.ledger.cashYen ?? ASSET_PRINCIPAL_YEN,
        battleMode: input.ledger.battleMode ?? "defense",
      }
    : buildInitialLedger(medalUnits);
  const previousTotalYen = ledger.totalYen || ASSET_PRINCIPAL_YEN;
  const previousBtcValueYen = Math.round(ledger.btcHeld * (ledger.btcPriceYen || btcPrice));
  const previousCashYen = Math.round(ledger.cashYen);

  const incomingDayChange = previousTotalYen - (ledger.previousTotalYen || previousTotalYen);
  const battleMode = resolveBattleMode(incomingDayChange);

  ledger = rolloverMonthIfNeeded({
    ...ledger,
    totalYen,
    btcPriceYen: btcPrice,
    ethPriceYen: ethPrice,
    battleMode,
    ...balance,
  });
  ledger = { ...ledger, medalUnits };

  const sentiment = inferNewsSentiment(input.newsSummary);
  const decision = decideTrade(ledger, pulse, sentiment, battleMode);

  let newTrades = [...ledger.trades];
  let monthlyPnl = ledger.monthlyRealizedPnlYen;
  let updatedBalance = balance;

  console.log(`[asset-trade] 市場: ${pulse.summary}`);
  console.log(`[asset-trade] 判断: ${decision.action} — ${decision.reason}`);

  if (decision.action === "BUY") {
    await sendOrder("BUY", decision.amountJpy, btcPrice);
    const trade: SolunaTradeRecord = {
      id: `trade-${Date.now()}`,
      createdAt: new Date().toISOString(),
      side: "BUY",
      product: "BTC_JPY",
      sizeJpy: decision.amountJpy,
      priceBtc: btcPrice,
      reason: decision.tradeReason,
      briefingId: input.briefingId,
    };
    newTrades = [...newTrades.slice(-29), trade];
    updatedBalance = await getBitFlyerBalance();
  } else if (decision.action === "SELL" && ledger.btcHeld > MIN_BTC_ORDER) {
    const sellValueJpy = Math.round(ledger.btcHeld * btcPrice);
    const avgBuyPrice = averageBuyPrice({ ...ledger, trades: newTrades }) ?? btcPrice;
    const costJpy = Math.round(ledger.btcHeld * avgBuyPrice);
    const pnl = sellValueJpy - costJpy;
    monthlyPnl += pnl;

    await sendOrder("SELL", sellValueJpy, btcPrice);
    const trade: SolunaTradeRecord = {
      id: `trade-${Date.now()}`,
      createdAt: new Date().toISOString(),
      side: "SELL",
      product: "BTC_JPY",
      sizeJpy: sellValueJpy,
      priceBtc: btcPrice,
      realizedPnlJpy: pnl,
      reason: decision.tradeReason,
      briefingId: input.briefingId,
    };
    newTrades = [...newTrades.slice(-29), trade];
    updatedBalance = await getBitFlyerBalance();
  }

  const sleepMode = isSleepModeActive(monthlyPnl, ledger);
  const updatedTotal = Math.round(
    updatedBalance.cashYen + updatedBalance.btcHeld * btcPrice + updatedBalance.ethHeld * ethPrice,
  );

  const buyAmount = decision.action === "BUY" ? decision.amountJpy : 0;
  const isTp = decision.action === "SELL" && decision.tradeReason === "take-profit";

  const solComments: Record<string, string> = {
    BUY: `市場パルス強気！ ${buyAmount.toLocaleString()} MP を蒼竜に投入。予測スコア ${pulse.score} で利益を狙うぜ！`,
    SELL: `${isTp ? "利確ドロップ成功" : "損切りで盾構え"}！累計 ${Math.round(monthlyPnl).toLocaleString()} ゴールド。${pulse.summary}`,
    HOLD: `今回は見送り。市場を見て利益見込みが出るまで温存する！ ${pulse.summary}`,
  };
  const lunaComments: Record<string, string> = {
    BUY: `板と約定のリアルタイム予測でエントリーしたわ。残魔力 ${Math.round(updatedBalance.cashYen).toLocaleString()} MP。${sleepMode ? "月次10%超え！おやすみモードへ。" : ""}`,
    SELL: `${isTp ? "利益を確定" : "損失を限定"}。市場が次のエッジを出すまで見張るわ。`,
    HOLD: sleepMode
      ? "おやすみモード中（月次10%超）。今月のゴールドは守りきる。"
      : `わかる範囲の市場情報では、いま無理に動かない方が期待値が高いわ。${pulse.summary}`,
  };

  const closingDayChange = updatedTotal - previousTotalYen;
  const closingBattleMode = resolveBattleMode(closingDayChange);

  return {
    ...ledger,
    cashYen: updatedBalance.cashYen,
    btcHeld: updatedBalance.btcHeld,
    ethHeld: updatedBalance.ethHeld,
    btcPriceYen: btcPrice,
    ethPriceYen: ethPrice,
    previousTotalYen,
    previousBtcValueYen,
    previousCashYen,
    totalYen: updatedTotal,
    monthlyRealizedPnlYen: monthlyPnl,
    sleepMode,
    battleMode: closingBattleMode,
    lastPromptBattleMode: battleMode,
    trades: newTrades,
    status: "done",
    solComment: solComments[decision.action],
    lunaComment: lunaComments[decision.action],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 裏稼働用: ストアから台帳・最新ニュースを読み、市場予測で売買して保存する
 */
export async function runAssetTradeTick(options?: {
  forceBriefingId?: string;
}): Promise<SolunaAssetLedger> {
  const { getLatestBriefing, getSystemAssets, getSystemHunter, saveSystemAssets } = await import(
    "@/lib/server/soluna-system-store"
  );
  const [ledger, hunter, briefing] = await Promise.all([
    getSystemAssets(),
    getSystemHunter(),
    getLatestBriefing(),
  ]);
  const tickId =
    options?.forceBriefingId ??
    briefing?.id ??
    `tick-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const updated = await runDailyAssetTrade({
    ledger,
    hunter,
    newsSummary: briefing?.summary ?? "",
    briefingId: tickId,
  });
  await saveSystemAssets(updated);
  return updated;
}
