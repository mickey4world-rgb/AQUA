/**
 * 資産運用 API クライアント + Soluna マルチ資産ロジック
 *
 * 運用ルール:
 *   1. 1回の取引は銘柄あたり最大 10,000 円（確信度でサイズ可変）
 *   2. 利確は短期でも可。損切りは原則しない／長期保有（〜1年）で回復を待つ
 *      ・現金 50 万円以下では損切り禁止（含み損は持ち越し）
 *      ・1年未満は損切りしない。1年超かつ深い含み損（-15%〜-25%）のみ例外
 *   3. 月次目標は月初残高×2%。元本10万未満は一律2,000円（それ未満の目標は無し）
 *      おやすみモードは実現損益が月初残高×10%を超えたら新規購入停止
 *   4. 裏稼働: 板・約定に加え、6か月〜昨日の多期間値動きで当日方向を見極めて売買
 *   5. 対象 Spot: BTC_JPY / ETH_JPY / XRP_JPY / XLM_JPY
 *      ※ SOL_JPY・LTC_JPY・BCH_JPY は bitFlyer Spot に JPY 建てが無い
 *      ※ FX_BTC_JPY はレバレッジ CFD のため自動売買対象外
 *   6. 分散: 現金下限 / 単一銘柄上限 / 暗号合計上限
 *   7. 買い条件を満たした銘柄は競合せず同時に買う（日次・現金・分散枠内で按分）
 */

import crypto from "crypto";
import type {
  SolunaAssetLedger,
  SolunaMonthlyAssetSummary,
  SolunaTradeProduct,
  SolunaTradeRecord,
} from "@/lib/types/soluna";
import { medalUnitScore } from "@/lib/server/soluna-battle";
import type { SolunaHunterState } from "@/lib/types/soluna";
import { resolveBattleMode } from "@/lib/server/soluna-asset-rpg";
import {
  fetchHorizonMomentums,
  type HorizonMomentum,
} from "@/lib/server/soluna-asset-horizons";
import {
  ASSET_PRINCIPAL_YEN,
  BUY_COOLDOWN_MS,
  BULLISH_SCORE,
  HARD_STOP_LOSS_RATE,
  HARD_TAKE_PROFIT_RATE,
  LONG_TERM_RECOVERY_HORIZON_MS,
  MAX_CRYPTO_RATIO,
  MAX_DAILY_BUY_YEN,
  MAX_SINGLE_ASSET_RATIO,
  MAX_SPREAD_BPS,
  MAX_TRADE_YEN,
  MIN_CASH_RATIO,
  MIN_HOLD_BEFORE_SOFT_STOP_MS,
  MIN_MONTHLY_TARGET_YEN,
  MONTHLY_TARGET_RATE,
  NO_STOP_LOSS_BELOW_CASH_YEN,
  SLEEP_MODE_RATE,
  SOFT_STOP_LOSS_RATE,
  SOFT_TAKE_PROFIT_RATE,
  STRONG_BULLISH_SCORE,
  TRADEABLE_PRODUCTS,
  type TradeableProduct,
} from "@/lib/soluna-asset-trade-constants";

export {
  ASSET_PRINCIPAL_YEN,
  MIN_MONTHLY_TARGET_YEN,
  TRADEABLE_PRODUCTS,
  type TradeableProduct,
};

// ── 定数（エンジン内エイリアス・後方互換 export）──────────────────────────────

/** bitFlyer Spot で将来拡張可能な候補（自動売買は TRADEABLE_PRODUCTS のみ） */
export const BITFLYER_SPOT_CANDIDATES = [
  "BTC_JPY",
  "ETH_JPY",
  "XRP_JPY",
  "XLM_JPY",
  "MONA_JPY",
  "ELF_JPY",
] as const;

const PRODUCT_META: Record<
  TradeableProduct,
  {
    currency: "BTC" | "ETH" | "XRP" | "XLM";
    minSize: number;
    decimals: number;
    label: string;
    rpgName: string;
  }
> = {
  BTC_JPY: {
    currency: "BTC",
    minSize: 0.0001,
    decimals: 4,
    label: "BTC",
    rpgName: "雷轟の蒼竜",
  },
  ETH_JPY: {
    currency: "ETH",
    minSize: 0.01,
    decimals: 2,
    label: "ETH",
    rpgName: "蒼穹の不死鳥",
  },
  XRP_JPY: {
    currency: "XRP",
    minSize: 1,
    decimals: 0,
    label: "XRP",
    rpgName: "銀濤の海竜",
  },
  XLM_JPY: {
    currency: "XLM",
    minSize: 1,
    decimals: 0,
    label: "XLM",
    rpgName: "星屑の銀帆船",
  },
};

export function computeMonthlyTargetYen(openingBalanceYen: number): number {
  const opening = Math.max(0, openingBalanceYen);
  if (opening < ASSET_PRINCIPAL_YEN) {
    return MIN_MONTHLY_TARGET_YEN;
  }
  return Math.max(MIN_MONTHLY_TARGET_YEN, Math.round(opening * MONTHLY_TARGET_RATE));
}

// ── API ───────────────────────────────────────────────────────────────────────

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
    throw new Error(`asset API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function bitFlyerPublicGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.bitflyer.com${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`asset public API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

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
  product: TradeableProduct;
  ltp: number;
  spreadBps: number;
  imbalance: number;
  momentumPct: number;
  buyPressure: number;
  volatilityPct: number;
  score: number;
  bias: "bullish" | "bearish" | "neutral";
  summary: string;
  horizon?: HorizonMomentum;
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

export async function fetchMarketPulse(
  product: TradeableProduct,
  horizon?: HorizonMomentum,
): Promise<MarketPulse> {
  const [ticker, board, executions] = await Promise.all([
    bitFlyerPublicGet<BfTicker>(`/v1/ticker?product_code=${product}`),
    bitFlyerPublicGet<BfBoard>(`/v1/board?product_code=${product}`),
    bitFlyerPublicGet<BfExecution[]>(`/v1/executions?product_code=${product}&count=80`),
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
  // 多期間トレンドを当日スコアに合成（短期約定よりやや控えめ）
  if (horizon) score += horizon.score * 0.7;
  score = Math.round(Math.max(-100, Math.min(100, score)));

  const bias: MarketPulse["bias"] =
    score >= BULLISH_SCORE ? "bullish" : score <= -BULLISH_SCORE ? "bearish" : "neutral";

  const label = PRODUCT_META[product].label;
  const priceLabel =
    product === "XRP_JPY" || product === "XLM_JPY"
      ? `${ticker.ltp.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`
      : `${Math.round(ticker.ltp).toLocaleString()}円`;
  const summary = [
    `${label} LTP ${priceLabel}`,
    `モメ ${momentumPct >= 0 ? "+" : ""}${(momentumPct * 100).toFixed(2)}%`,
    `買い圧 ${(buyPressure * 100).toFixed(0)}%`,
    `板偏り ${imbalance >= 0 ? "+" : ""}${(imbalance * 100).toFixed(0)}%`,
    `ｽﾌﾟ ${spreadBps.toFixed(1)}bps`,
    horizon ? horizon.summary : null,
    `予測スコア ${score}`,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    product,
    ltp: ticker.ltp,
    spreadBps,
    imbalance,
    momentumPct,
    buyPressure,
    volatilityPct,
    score,
    bias,
    summary,
    horizon,
  };
}

/** @deprecated use fetchMarketPulse("BTC_JPY") */
export async function fetchBtcMarketPulse(): Promise<MarketPulse> {
  return fetchMarketPulse("BTC_JPY");
}

type BfBalance = { currency_code: string; amount: number; available: number };

export async function getBitFlyerBalance(): Promise<{
  cashYen: number;
  btcHeld: number;
  ethHeld: number;
  xrpHeld: number;
  xlmHeld: number;
  zpgHeld: number;
}> {
  const balances = await bitFlyerFetch<BfBalance[]>("GET", "/v1/me/getbalance");
  const jpy = balances.find((b) => b.currency_code === "JPY");
  const btc = balances.find((b) => b.currency_code === "BTC");
  const eth = balances.find((b) => b.currency_code === "ETH");
  const xrp = balances.find((b) => b.currency_code === "XRP");
  const xlm = balances.find((b) => b.currency_code === "XLM");
  const zpg = balances.find((b) => b.currency_code === "ZPG");
  return {
    cashYen: jpy?.available ?? 0,
    btcHeld: btc?.available ?? 0,
    ethHeld: eth?.available ?? 0,
    xrpHeld: xrp?.available ?? 0,
    xlmHeld: xlm?.available ?? 0,
    zpgHeld: zpg?.available ?? 0,
  };
}

type BfOrderResponse = { child_order_acceptance_id: string };

function roundSize(size: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(size * factor) / factor;
}

async function sendOrder(
  product: TradeableProduct,
  side: "BUY" | "SELL",
  sizeJpy: number,
  priceYen: number,
): Promise<string> {
  const meta = PRODUCT_META[product];
  const raw = sizeJpy / Math.max(1, priceYen);
  const size = Math.max(meta.minSize, roundSize(raw, meta.decimals));
  const order = await bitFlyerFetch<BfOrderResponse>("POST", "/v1/me/sendchildorder", {
    product_code: product,
    child_order_type: "MARKET",
    side,
    size,
    minute_to_expire: 10,
    time_in_force: "GTC",
  });
  return order.child_order_acceptance_id;
}

// ── 台帳ヘルパ ────────────────────────────────────────────────────────────────

function jstMonthStr(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7);
}

function sleepModeThresholdYen(
  ledger: Pick<SolunaAssetLedger, "lastMonthTotalYen" | "principalYen">,
): number {
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
  const targetYen = computeMonthlyTargetYen(ASSET_PRINCIPAL_YEN);
  return {
    principalYen: ASSET_PRINCIPAL_YEN,
    lastMonthTotalYen: ASSET_PRINCIPAL_YEN,
    monthlyTargetYen: targetYen,
    monthlyRealizedPnlYen: 0,
    sleepMode: false,
    btcHeld: 0,
    ethHeld: 0,
    xrpHeld: 0,
    xlmHeld: 0,
    zpgHeld: 0,
    cashYen: ASSET_PRINCIPAL_YEN,
    totalYen: ASSET_PRINCIPAL_YEN,
    previousTotalYen: ASSET_PRINCIPAL_YEN,
    previousBtcValueYen: 0,
    previousCashYen: ASSET_PRINCIPAL_YEN,
    btcPriceYen: 0,
    ethPriceYen: 0,
    xrpPriceYen: 0,
    xlmPriceYen: 0,
    zpgPriceYen: 0,
    battleMode: "defense",
    trades: [],
    monthlySummaries: [],
    medalUnits,
    status: "waiting-spec",
    solComment: "聖なる魔力タンクへの充填を待っている。届き次第、蒼竜・不死鳥・海竜・銀帆船を召喚する！",
    lunaComment: "入金確認まで待機。分散ルールは決まった、あとは実行するだけ。",
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
  const targetYen = computeMonthlyTargetYen(openingBalance);
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

type BuyLeg = {
  product: TradeableProduct;
  amountJpy: number;
  pulse: MarketPulse;
  tradeReason: "dca";
  ruleIds: number[];
  reason: string;
};

type TradeDecision =
  | {
      action: "BUY";
      buys: BuyLeg[];
      reason: string;
      ruleIds: number[];
    }
  | {
      action: "SELL";
      product: TradeableProduct;
      reason: string;
      tradeReason: "take-profit" | "stop-loss";
      ruleIds: number[];
      pulse: MarketPulse;
    }
  | { action: "HOLD"; reason: string; ruleIds?: number[] };

function formatReasonWithRuleIds(ruleIds: number[], detail: string): string {
  const tag = [...new Set(ruleIds)]
    .sort((a, b) => a - b)
    .map((id) => `#${id}`)
    .join("+");
  return tag ? `${tag} ${detail}` : detail;
}

/** 買い約定後の台帳をシミュレーション（同バッチ内の枠計算用） */
function applyBuyToLedger(
  ledger: SolunaAssetLedger,
  product: TradeableProduct,
  amountJpy: number,
  price: number,
): SolunaAssetLedger {
  if (price <= 0 || amountJpy <= 0) return ledger;
  const size = amountJpy / price;
  const next = { ...ledger, cashYen: Math.max(0, ledger.cashYen - amountJpy) };
  if (product === "BTC_JPY") next.btcHeld = (ledger.btcHeld ?? 0) + size;
  else if (product === "ETH_JPY") next.ethHeld = (ledger.ethHeld ?? 0) + size;
  else if (product === "XRP_JPY") next.xrpHeld = (ledger.xrpHeld ?? 0) + size;
  else next.xlmHeld = (ledger.xlmHeld ?? 0) + size;
  next.totalYen = Math.round(
    next.cashYen +
      (next.btcHeld ?? 0) * (ledger.btcPriceYen || 0) +
      (next.ethHeld ?? 0) * (ledger.ethPriceYen || 0) +
      (next.xrpHeld ?? 0) * (ledger.xrpPriceYen || 0) +
      (next.xlmHeld ?? 0) * (ledger.xlmPriceYen || 0),
  );
  return next;
}
function jstDayKey(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function lastBuyTrade(ledger: SolunaAssetLedger, product?: TradeableProduct): SolunaTradeRecord | null {
  const buys = ledger.trades.filter(
    (t) => t.side === "BUY" && (!product || t.product === product),
  );
  return buys.length > 0 ? buys[buys.length - 1]! : null;
}

function boughtYenOnJstDay(ledger: SolunaAssetLedger, dayKey: string): number {
  return ledger.trades
    .filter((t) => t.side === "BUY" && jstDayKey(new Date(t.createdAt)) === dayKey)
    .reduce((sum, t) => sum + t.sizeJpy, 0);
}

function averageBuyPrice(ledger: SolunaAssetLedger, product: SolunaTradeProduct): number | null {
  const buyTrades = ledger.trades.filter((t) => t.side === "BUY" && t.product === product);
  if (buyTrades.length === 0) {
    // 旧データ互換: product 未区別の BTC のみ
    if (product === "BTC_JPY") {
      const legacy = ledger.trades.filter(
        (t) => t.side === "BUY" && (!t.product || t.product === "BTC_JPY"),
      );
      if (legacy.length === 0) return null;
      const notional = legacy.reduce((s, t) => s + t.sizeJpy, 0);
      if (notional <= 0) return null;
      return legacy.reduce((s, t) => s + t.priceBtc * t.sizeJpy, 0) / notional;
    }
    return null;
  }
  const notional = buyTrades.reduce((s, t) => s + t.sizeJpy, 0);
  if (notional <= 0) return null;
  return buyTrades.reduce((s, t) => s + t.priceBtc * t.sizeJpy, 0) / notional;
}

function heldAmount(ledger: SolunaAssetLedger, product: TradeableProduct): number {
  if (product === "BTC_JPY") return ledger.btcHeld;
  if (product === "ETH_JPY") return ledger.ethHeld ?? 0;
  if (product === "XRP_JPY") return ledger.xrpHeld ?? 0;
  return ledger.xlmHeld ?? 0;
}

function assetValueYen(ledger: SolunaAssetLedger, product: TradeableProduct, price: number): number {
  return Math.round(heldAmount(ledger, product) * price);
}

function cryptoValueYen(
  ledger: SolunaAssetLedger,
  prices: Record<TradeableProduct, number>,
): number {
  return TRADEABLE_PRODUCTS.reduce(
    (sum, product) => sum + assetValueYen(ledger, product, prices[product] ?? 0),
    0,
  );
}

function cashFloorYen(totalYen: number): number {
  return Math.round(totalYen * MIN_CASH_RATIO);
}

function maxBuyRoomYen(
  ledger: SolunaAssetLedger,
  product: TradeableProduct,
  prices: Record<TradeableProduct, number>,
): number {
  const total = Math.max(1, ledger.totalYen);
  const current = assetValueYen(ledger, product, prices[product]);
  const roomSingle = Math.max(0, Math.round(total * MAX_SINGLE_ASSET_RATIO) - current);
  const cryptoNow = cryptoValueYen(ledger, prices);
  const roomCrypto = Math.max(0, Math.round(total * MAX_CRYPTO_RATIO) - cryptoNow);
  const spendableCash = Math.max(0, Math.round(ledger.cashYen - cashFloorYen(total)));
  return Math.max(0, Math.min(roomSingle, roomCrypto, spendableCash, MAX_TRADE_YEN));
}

function lastBuyAgeMs(ledger: SolunaAssetLedger, product: TradeableProduct): number | null {
  const last = lastBuyTrade(ledger, product);
  if (!last) return null;
  return Date.now() - new Date(last.createdAt).getTime();
}

/** 銘柄の最初の買いからの経過（長期保有判定用） */
function firstBuyAgeMs(ledger: SolunaAssetLedger, product: TradeableProduct): number | null {
  const buys = ledger.trades
    .filter((t) => t.side === "BUY" && t.product === product)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  if (buys.length === 0 && product === "BTC_JPY") {
    const legacy = ledger.trades
      .filter((t) => t.side === "BUY" && (!t.product || t.product === "BTC_JPY"))
      .sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    if (legacy.length === 0) return null;
    return Date.now() - new Date(legacy[0]!.createdAt).getTime();
  }
  if (buys.length === 0) return null;
  return Date.now() - new Date(buys[0]!.createdAt).getTime();
}

function formatHoldDays(holdMs: number | null): string {
  if (holdMs == null) return "保有期間不明";
  const days = Math.max(0, Math.floor(holdMs / (24 * 60 * 60 * 1000)));
  return `${days}日保有`;
}

function trySellDecision(
  ledger: SolunaAssetLedger,
  pulse: MarketPulse,
): Extract<TradeDecision, { action: "SELL" }> | null {
  const product = pulse.product;
  const meta = PRODUCT_META[product];
  const held = heldAmount(ledger, product);
  if (held < meta.minSize) return null;

  const avgBuyPrice = averageBuyPrice(ledger, product);
  if (!avgBuyPrice) return null;

  const changeRate = (pulse.ltp - avgBuyPrice) / avgBuyPrice;
  const horizonScore = pulse.horizon?.score ?? 0;
  const fading =
    (pulse.score < -8 || pulse.bias === "bearish") && horizonScore <= 5;
  const acceleratingDown =
    pulse.score <= -STRONG_BULLISH_SCORE &&
    pulse.momentumPct < -0.002 &&
    horizonScore <= -10;
  const holdMs = firstBuyAgeMs(ledger, product) ?? lastBuyAgeMs(ledger, product);
  const holdLabel = formatHoldDays(holdMs);
  const cashYen = Math.round(ledger.cashYen);
  const stopLossBlockedByCash = cashYen <= NO_STOP_LOSS_BELOW_CASH_YEN;
  const withinLongTermHorizon =
    holdMs == null || holdMs < LONG_TERM_RECOVERY_HORIZON_MS;

  // プラス圏は利確（少額積立でも利益確定は継続）
  if (changeRate >= HARD_TAKE_PROFIT_RATE) {
    const ruleIds = [11];
    return {
      action: "SELL",
      product,
      tradeReason: "take-profit",
      ruleIds,
      pulse,
      reason: formatReasonWithRuleIds(
        ruleIds,
        `${meta.label} 硬利確 +${(changeRate * 100).toFixed(1)}%（${holdLabel}）｜${pulse.summary}`,
      ),
    };
  }
  if (changeRate >= SOFT_TAKE_PROFIT_RATE && fading) {
    const ruleIds = [12];
    return {
      action: "SELL",
      product,
      tradeReason: "take-profit",
      ruleIds,
      pulse,
      reason: formatReasonWithRuleIds(
        ruleIds,
        `${meta.label} 勢い減衰で利確 +${(changeRate * 100).toFixed(1)}%（${holdLabel}）｜${pulse.summary}`,
      ),
    };
  }

  // 含み損: 原則は長期保有してプラス転換を待つ
  const underwater = changeRate < 0;
  if (!underwater) return null;

  if (stopLossBlockedByCash) {
    console.info(
      `[asset-trade] skip stop-loss ${meta.label} cash=${cashYen}≤${NO_STOP_LOSS_BELOW_CASH_YEN} pnl=${(changeRate * 100).toFixed(1)}% ${holdLabel} → 現金薄いため損切り禁止・長期保有 #13`,
    );
    return null;
  }

  if (withinLongTermHorizon) {
    console.info(
      `[asset-trade] defer stop-loss ${meta.label} pnl=${(changeRate * 100).toFixed(1)}% ${holdLabel} → 1年以内は回復余地を優先 #14`,
    );
    return null;
  }

  // 1年以上保有・現金に余裕あり、かつ深い含み損のみ例外的に損切り
  if (changeRate <= HARD_STOP_LOSS_RATE) {
    const ruleIds = [15];
    return {
      action: "SELL",
      product,
      tradeReason: "stop-loss",
      ruleIds,
      pulse,
      reason: formatReasonWithRuleIds(
        ruleIds,
        `${meta.label} 1年超保有後の硬損切り ${(changeRate * 100).toFixed(1)}%（${holdLabel}）｜${pulse.summary}`,
      ),
    };
  }

  if (
    changeRate <= SOFT_STOP_LOSS_RATE &&
    acceleratingDown &&
    holdMs != null &&
    holdMs >= MIN_HOLD_BEFORE_SOFT_STOP_MS
  ) {
    const ruleIds = [16];
    return {
      action: "SELL",
      product,
      tradeReason: "stop-loss",
      ruleIds,
      pulse,
      reason: formatReasonWithRuleIds(
        ruleIds,
        `${meta.label} 1年超・下落継続のため損切り ${(changeRate * 100).toFixed(1)}%（${holdLabel}）｜${pulse.summary}`,
      ),
    };
  }

  return null;
}

/**
 * BTC/ETH/XRP/XLM の市場パルス・多期間トレンド・分散上限から売買判断する
 */
function decideTrade(
  ledger: SolunaAssetLedger,
  pulses: MarketPulse[],
  newsSentiment: "positive" | "negative" | "neutral",
  battleMode: "attack" | "defense",
): TradeDecision {
  const prices = Object.fromEntries(pulses.map((p) => [p.product, p.ltp])) as Record<
    TradeableProduct,
    number
  >;
  const pulseSummary = pulses.map((p) => `${PRODUCT_META[p.product].label}:${p.score}`).join(" ");

  if (isSleepModeActive(ledger.monthlyRealizedPnlYen, ledger)) {
    return {
      action: "HOLD",
      ruleIds: [17],
      reason: formatReasonWithRuleIds(
        [17],
        `月次おやすみ閾値（10%）達成済み｜${pulseSummary}`,
      ),
    };
  }

  // 利確・損切りを優先（損失が大きいもの → 利益が大きいもの）
  const sellCandidates = pulses
    .map((p) => trySellDecision(ledger, p))
    .filter((d): d is Extract<TradeDecision, { action: "SELL" }> => Boolean(d));
  if (sellCandidates.length > 0) {
    sellCandidates.sort((a, b) => {
      const avgA = averageBuyPrice(ledger, a.product) ?? a.pulse.ltp;
      const avgB = averageBuyPrice(ledger, b.product) ?? b.pulse.ltp;
      const chA = (a.pulse.ltp - avgA) / avgA;
      const chB = (b.pulse.ltp - avgB) / avgB;
      return chA - chB;
    });
    return sellCandidates[0]!;
  }

  const lastBuy = lastBuyTrade(ledger);
  if (lastBuy) {
    const elapsed = Date.now() - new Date(lastBuy.createdAt).getTime();
    if (elapsed < BUY_COOLDOWN_MS) {
      const remainH = ((BUY_COOLDOWN_MS - elapsed) / 3_600_000).toFixed(1);
      return {
        action: "HOLD",
        ruleIds: [4],
        reason: formatReasonWithRuleIds(
          [4],
          `エントリー冷却中（あと約 ${remainH}h）。利確監視は継続｜${pulseSummary}`,
        ),
      };
    }
  }

  const todayBought = boughtYenOnJstDay(ledger, jstDayKey());
  const dailyBuyRoom = MAX_DAILY_BUY_YEN - todayBought;
  if (dailyBuyRoom < 1000) {
    return {
      action: "HOLD",
      ruleIds: [3],
      reason: formatReasonWithRuleIds(
        [3],
        `本日の購入枠を消化済み。利確・損切りのみ継続｜${pulseSummary}`,
      ),
    };
  }

  const floor = cashFloorYen(ledger.totalYen);
  if (ledger.cashYen <= floor + 999) {
    return {
      action: "HOLD",
      ruleIds: [5],
      reason: formatReasonWithRuleIds(
        [5],
        `現金下限（${(MIN_CASH_RATIO * 100).toFixed(0)}%）を維持｜残 ${Math.round(ledger.cashYen).toLocaleString()}円｜${pulseSummary}`,
      ),
    };
  }

  let buyThreshold = BULLISH_SCORE;
  if (battleMode === "defense") buyThreshold += 12;
  if (newsSentiment === "negative") buyThreshold += 10;
  if (newsSentiment === "positive") buyThreshold -= 6;
  if (battleMode === "attack") buyThreshold -= 5;

  const qualified = pulses
    .filter((p) => {
      if (p.bias !== "bullish" || p.score < buyThreshold || p.spreadBps > MAX_SPREAD_BPS) {
        return false;
      }
      const horizonScore = p.horizon?.score ?? 0;
      if (horizonScore <= -28 && p.score < STRONG_BULLISH_SCORE + 10) return false;
      if ((p.horizon?.change1d ?? 0) < -0.04 && (p.horizon?.change1w ?? 0) < -0.06) {
        return p.score >= buyThreshold + 8;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score);

  if (qualified.length === 0) {
    return {
      action: "HOLD",
      ruleIds: [8, 9, 10],
      reason: formatReasonWithRuleIds(
        [8, 9, 10],
        `分散上限内で強気銘柄なし（閾値 ${buyThreshold}）｜${pulseSummary}`,
      ),
    };
  }

  // 条件を満たした銘柄は競合させず、枠の許す限り同時に買う（スコア順に予算消化）
  let working: SolunaAssetLedger = {
    ...ledger,
    btcPriceYen: prices.BTC_JPY,
    ethPriceYen: prices.ETH_JPY,
    xrpPriceYen: prices.XRP_JPY,
    xlmPriceYen: prices.XLM_JPY,
  };
  let remainingDaily = dailyBuyRoom;
  const buys: BuyLeg[] = [];
  const ruleIds = [1, 2, 6, 7, 8, 19];

  for (const pulse of qualified) {
    if (remainingDaily < 1000) break;
    const room = maxBuyRoomYen(working, pulse.product, prices);
    if (room < 1000) continue;
    const conviction =
      pulse.score >= STRONG_BULLISH_SCORE
        ? 1
        : 0.45 + ((pulse.score - buyThreshold) / 80) * 0.55;
    const amountJpy = Math.max(
      1000,
      Math.min(room, remainingDaily, Math.round(MAX_TRADE_YEN * conviction)),
    );
    if (amountJpy < 1000) continue;
    const meta = PRODUCT_META[pulse.product];
    buys.push({
      product: pulse.product,
      amountJpy,
      pulse,
      tradeReason: "dca",
      ruleIds,
      reason: formatReasonWithRuleIds(
        ruleIds,
        `${meta.rpgName}へ分散召喚 ${amountJpy.toLocaleString()}円（確信度 ${(conviction * 100).toFixed(0)}%／同時買 ${qualified.length}銘柄候補／単一上限${(MAX_SINGLE_ASSET_RATIO * 100).toFixed(0)}%・暗号上限${(MAX_CRYPTO_RATIO * 100).toFixed(0)}%）｜${pulse.summary}`,
      ),
    });
    working = applyBuyToLedger(working, pulse.product, amountJpy, pulse.ltp);
    remainingDaily -= amountJpy;
  }

  if (buys.length === 0) {
    return {
      action: "HOLD",
      ruleIds: [5, 6, 7],
      reason: formatReasonWithRuleIds(
        [5, 6, 7],
        `強気銘柄はあるが分散・現金枠不足（閾値 ${buyThreshold}）｜${pulseSummary}`,
      ),
    };
  }

  const labels = buys
    .map((b) => `${PRODUCT_META[b.product].label} ${b.amountJpy.toLocaleString()}円`)
    .join("・");
  return {
    action: "BUY",
    buys,
    ruleIds,
    reason: formatReasonWithRuleIds(
      ruleIds,
      `条件達成 ${buys.length}銘柄を同時召喚: ${labels}｜${pulseSummary}`,
    ),
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

// ── メイン ────────────────────────────────────────────────────────────────────

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
        "魔力タンクのAPI接続が未設定よ。設定が来たら BTC／ETH／XRP／XLM を分散して動くわ。取引所の名前は外に出さないこと。",
      updatedAt: new Date().toISOString(),
    };
  }

  const horizons = await fetchHorizonMomentums([...TRADEABLE_PRODUCTS]);
  const [balance, btcPulse, ethPulse, xrpPulse, xlmPulse] = await Promise.all([
    getBitFlyerBalance(),
    fetchMarketPulse("BTC_JPY", horizons.get("BTC_JPY")),
    fetchMarketPulse("ETH_JPY", horizons.get("ETH_JPY")),
    fetchMarketPulse("XRP_JPY", horizons.get("XRP_JPY")),
    fetchMarketPulse("XLM_JPY", horizons.get("XLM_JPY")),
  ]);
  const pulses = [btcPulse, ethPulse, xrpPulse, xlmPulse];
  const btcPrice = btcPulse.ltp;
  const ethPrice = ethPulse.ltp;
  const xrpPrice = xrpPulse.ltp;
  const xlmPrice = xlmPulse.ltp;
  // ZPG は投資カテゴリ外・Lightning 自動売買不可のため総額に含めない
  const zpgPrice = 0;
  const totalYen = Math.round(
    balance.cashYen +
      balance.btcHeld * btcPrice +
      balance.ethHeld * ethPrice +
      balance.xrpHeld * xrpPrice +
      balance.xlmHeld * xlmPrice,
  );

  let ledger = input.ledger
    ? {
        ...buildInitialLedger(medalUnits),
        ...input.ledger,
        ethHeld: input.ledger.ethHeld ?? 0,
        xrpHeld: input.ledger.xrpHeld ?? 0,
        xlmHeld: input.ledger.xlmHeld ?? 0,
        zpgHeld: input.ledger.zpgHeld ?? 0,
        ethPriceYen: input.ledger.ethPriceYen ?? 0,
        xrpPriceYen: input.ledger.xrpPriceYen ?? 0,
        xlmPriceYen: input.ledger.xlmPriceYen ?? 0,
        zpgPriceYen: input.ledger.zpgPriceYen ?? 0,
        previousTotalYen: input.ledger.previousTotalYen ?? input.ledger.totalYen ?? ASSET_PRINCIPAL_YEN,
        previousBtcValueYen: input.ledger.previousBtcValueYen ?? 0,
        previousCashYen: input.ledger.previousCashYen ?? input.ledger.cashYen ?? ASSET_PRINCIPAL_YEN,
        battleMode: input.ledger.battleMode ?? "defense",
        monthlyTargetYen: Math.max(
          MIN_MONTHLY_TARGET_YEN,
          input.ledger.monthlyTargetYen ?? MIN_MONTHLY_TARGET_YEN,
        ),
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
    xrpPriceYen: xrpPrice,
    xlmPriceYen: xlmPrice,
    zpgPriceYen: zpgPrice,
    battleMode,
    ...balance,
  });
  ledger = { ...ledger, medalUnits };

  const sentiment = inferNewsSentiment(input.newsSummary);
  const decision = decideTrade(ledger, pulses, sentiment, battleMode);

  let newTrades = [...ledger.trades];
  let monthlyPnl = ledger.monthlyRealizedPnlYen;
  let updatedBalance = balance;

  console.log(`[asset-trade] 市場: ${pulses.map((p) => p.summary).join(" || ")}`);
  console.log(`[asset-trade] 判断: ${decision.action} — ${decision.reason}`);

  const executedTrades: SolunaTradeRecord[] = [];

  if (decision.action === "BUY") {
    for (const [index, leg] of decision.buys.entries()) {
      await sendOrder(leg.product, "BUY", leg.amountJpy, leg.pulse.ltp);
      const trade: SolunaTradeRecord = {
        id: `trade-${Date.now()}-${index}`,
        createdAt: new Date().toISOString(),
        side: "BUY",
        product: leg.product,
        sizeJpy: leg.amountJpy,
        priceBtc: leg.pulse.ltp,
        reason: leg.tradeReason,
        ruleIds: leg.ruleIds,
        reasonDetail: leg.reason,
        briefingId: input.briefingId,
      };
      newTrades = [...newTrades.slice(-29), trade];
      executedTrades.push(trade);
      // 実残高を都度取り、次の銘柄の枠計算は取引所側に寄せる
      updatedBalance = await getBitFlyerBalance();
    }
  } else if (decision.action === "SELL") {
    const held = heldAmount(ledger, decision.product);
    const meta = PRODUCT_META[decision.product];
    if (held >= meta.minSize) {
      const sellValueJpy = Math.round(held * decision.pulse.ltp);
      const avgBuyPrice =
        averageBuyPrice({ ...ledger, trades: newTrades }, decision.product) ??
        decision.pulse.ltp;
      const costJpy = Math.round(held * avgBuyPrice);
      const pnl = sellValueJpy - costJpy;
      monthlyPnl += pnl;

      await sendOrder(decision.product, "SELL", sellValueJpy, decision.pulse.ltp);
      const trade: SolunaTradeRecord = {
        id: `trade-${Date.now()}`,
        createdAt: new Date().toISOString(),
        side: "SELL",
        product: decision.product,
        sizeJpy: sellValueJpy,
        priceBtc: decision.pulse.ltp,
        realizedPnlJpy: pnl,
        reason: decision.tradeReason,
        ruleIds: decision.ruleIds,
        reasonDetail: decision.reason,
        briefingId: input.briefingId,
      };
      newTrades = [...newTrades.slice(-29), trade];
      executedTrades.push(trade);
      updatedBalance = await getBitFlyerBalance();
    }
  }

  const sleepMode = isSleepModeActive(monthlyPnl, ledger);
  const updatedTotal = Math.round(
    updatedBalance.cashYen +
      updatedBalance.btcHeld * btcPrice +
      updatedBalance.ethHeld * ethPrice +
      updatedBalance.xrpHeld * xrpPrice +
      updatedBalance.xlmHeld * xlmPrice,
  );

  const buyTotal =
    decision.action === "BUY"
      ? decision.buys.reduce((sum, leg) => sum + leg.amountJpy, 0)
      : 0;
  const buyLabels =
    decision.action === "BUY"
      ? decision.buys.map((leg) => PRODUCT_META[leg.product].label).join("/")
      : "";
  const isTp = decision.action === "SELL" && decision.tradeReason === "take-profit";
  const sellLabel =
    decision.action === "SELL" ? PRODUCT_META[decision.product].rpgName : "";

  let solComment = "";
  let lunaComment = "";
  if (decision.action === "BUY") {
    solComment = `分散召喚！ ${buyLabels} に合計 ${buyTotal.toLocaleString()} MP（${decision.buys.length}銘柄同時）。現金 ${(MIN_CASH_RATIO * 100).toFixed(0)}% は死守するぜ！`;
    lunaComment = `条件を満たした銘柄は競わせず同時に入れた（#19）。単一 ${(MAX_SINGLE_ASSET_RATIO * 100).toFixed(0)}%・暗号合計 ${(MAX_CRYPTO_RATIO * 100).toFixed(0)}% 内。残魔力 ${Math.round(updatedBalance.cashYen).toLocaleString()} MP。${sleepMode ? "月次10%超え！おやすみモードへ。" : ""}`;
  } else if (decision.action === "SELL") {
    solComment = `${isTp ? "利確ドロップ成功" : "例外的な長期損切り"}（${sellLabel}）！累計 ${Math.round(monthlyPnl).toLocaleString()} ゴールド。`;
    lunaComment = `${isTp ? "利益を確定" : "1年超の深い含み損のみ例外処理"}。次の召喚枠は条件達成銘柄を同時に検討するわ。`;
  } else {
    solComment = `見送り。含み損は長期保有で待つ。現金 ${(MIN_CASH_RATIO * 100).toFixed(0)}% を温存！`;
    lunaComment = sleepMode
      ? "おやすみモード中（月次10%超）。今月のゴールドは守りきる。"
      : `少額積立は焦らない。現金が薄いときは損切りせず、プラス転換を待つ判断よ。${decision.reason}`;
  }

  const closingDayChange = updatedTotal - previousTotalYen;
  const closingBattleMode = resolveBattleMode(closingDayChange);

  const updatedLedger: SolunaAssetLedger = {
    ...ledger,
    cashYen: updatedBalance.cashYen,
    btcHeld: updatedBalance.btcHeld,
    ethHeld: updatedBalance.ethHeld,
    xrpHeld: updatedBalance.xrpHeld,
    xlmHeld: updatedBalance.xlmHeld,
    zpgHeld: updatedBalance.zpgHeld,
    btcPriceYen: btcPrice,
    ethPriceYen: ethPrice,
    xrpPriceYen: xrpPrice,
    xlmPriceYen: xlmPrice,
    zpgPriceYen: zpgPrice,
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
    solComment,
    lunaComment,
    updatedAt: new Date().toISOString(),
  };

  for (const trade of executedTrades) {
    try {
      const { notifyAssetTradeExecuted } = await import(
        "@/lib/server/soluna-asset-trade-notify"
      );
      await notifyAssetTradeExecuted({
        trade,
        solComment: updatedLedger.solComment,
        lunaComment: updatedLedger.lunaComment,
        totalYen: updatedLedger.totalYen,
        monthlyRealizedPnlYen: updatedLedger.monthlyRealizedPnlYen,
      });
    } catch (error) {
      console.warn("[asset-trade] notify email failed", error);
    }
  }

  return updatedLedger;
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
