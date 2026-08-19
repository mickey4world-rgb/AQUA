/**
 * bitFlyer Lightning API クライアント + Soluna 資産運用ロジック
 *
 * 運用ルール:
 *   1. ドルコスト平均法: 1回の取引は最大 10,000 円
 *   2. 利確: 購入価格から +3〜5% で売却
 *   3. 損切り: 購入価格から -3% で売却
 *   4. おやすみモード: 当月実現損益が目標（月初残高×2%）に達したら新規購入停止
 */

import crypto from "crypto";
import type {
  SolunaAssetLedger,
  SolunaMonthlyAssetSummary,
  SolunaTradeRecord,
} from "@/lib/types/soluna";
import { medalUnitScore } from "@/lib/server/soluna-battle";
import type { SolunaHunterState } from "@/lib/types/soluna";

// ── 定数 ─────────────────────────────────────────────────────────────────────

export const ASSET_PRINCIPAL_YEN = 100_000;
const MAX_TRADE_YEN = 10_000;         // 1回の最大取引額
const TAKE_PROFIT_RATE = 0.04;        // 利確ライン: +4%
const STOP_LOSS_RATE = -0.03;         // 損切りライン: -3%
const MONTHLY_TARGET_RATE = 0.02;     // 月利目標: 2%
const SLEEP_MODE_THRESHOLD = 0.003;   // おやすみモード閾値: 月初残高×0.3%（実際は monthlyTargetYen を使用）
const MIN_BTC_ORDER = 0.0001;         // bitFlyer 最小注文量 (BTC)

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

// ── 市場データ ──────────────────────────────────────────────────────────────

type BfTicker = { ltp: number; best_bid: number; best_ask: number };

export async function getBtcPrice(): Promise<number> {
  const ticker = await bitFlyerFetch<BfTicker>("GET", "/v1/ticker?product_code=BTC_JPY");
  return ticker.ltp;
}

type BfBalance = { currency_code: string; amount: number; available: number };

export async function getBitFlyerBalance(): Promise<{ cashYen: number; btcHeld: number }> {
  const balances = await bitFlyerFetch<BfBalance[]>("GET", "/v1/me/getbalance");
  const jpy = balances.find((b) => b.currency_code === "JPY");
  const btc = balances.find((b) => b.currency_code === "BTC");
  return {
    cashYen: jpy?.available ?? 0,
    btcHeld: btc?.available ?? 0,
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
  return jst.toISOString().slice(0, 7); // "2026-08"
}

function buildInitialLedger(medalUnits: number): SolunaAssetLedger {
  const now = new Date().toISOString();
  const month = jstMonthStr();
  const targetYen = Math.round(ASSET_PRINCIPAL_YEN * MONTHLY_TARGET_RATE);
  return {
    principalYen: ASSET_PRINCIPAL_YEN,
    lastMonthTotalYen: ASSET_PRINCIPAL_YEN,
    monthlyTargetYen: targetYen,
    monthlyRealizedPnlYen: 0,
    sleepMode: false,
    btcHeld: 0,
    cashYen: ASSET_PRINCIPAL_YEN,
    totalYen: ASSET_PRINCIPAL_YEN,
    btcPriceYen: 0,
    trades: [],
    monthlySummaries: [],
    medalUnits,
    status: "waiting-spec",
    solComment: "入金待ちだ。資金が届いたら即スタートする。",
    lunaComment: "入金確認まで待機。ルールは決まった、あとは実行するだけ。",
    updatedAt: now,
  };
}

/**
 * 月が変わっていれば月次サマリーを確定し、新しい月の目標を更新する。
 */
function rolloverMonthIfNeeded(ledger: SolunaAssetLedger): SolunaAssetLedger {
  const currentMonth = jstMonthStr();
  const summaries = ledger.monthlySummaries ?? [];
  const lastSummary = summaries[summaries.length - 1];

  if (lastSummary?.month === currentMonth) return ledger; // 今月はまだ

  // 前月のサマリーを確定
  const newSummaries: SolunaMonthlyAssetSummary[] = [...summaries];
  if (lastSummary && lastSummary.month !== currentMonth) {
    newSummaries[newSummaries.length - 1] = {
      ...lastSummary,
      realizedPnlYen: ledger.monthlyRealizedPnlYen,
      goalReached: ledger.sleepMode,
    };
  }

  // 今月の目標を計算
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
    monthlySummaries: newSummaries.slice(-13), // 最大13ヶ月
  };
}

type TradeDecision =
  | { action: "BUY"; reason: string; amountJpy: number }
  | { action: "SELL"; reason: string }
  | { action: "HOLD"; reason: string };

/**
 * ニュースセンチメント・現在価格・保有状況から売買を判断する
 */
function decideTrade(
  ledger: SolunaAssetLedger,
  btcPrice: number,
  newsSentiment: "positive" | "negative" | "neutral",
): TradeDecision {
  // おやすみモード: 目標達成済みは新規購入しない
  if (ledger.sleepMode) {
    return { action: "HOLD", reason: "月次目標達成済み（おやすみモード）" };
  }

  // 保有 BTC があれば利確・損切りチェック
  if (ledger.btcHeld > MIN_BTC_ORDER) {
    const buyTrades = ledger.trades.filter((t) => t.side === "BUY");
    if (buyTrades.length > 0) {
      const avgBuyPrice =
        buyTrades.reduce((s, t) => s + t.priceBtc * t.sizeJpy, 0) /
        buyTrades.reduce((s, t) => s + t.sizeJpy, 0);
      const changeRate = (btcPrice - avgBuyPrice) / avgBuyPrice;

      if (changeRate >= TAKE_PROFIT_RATE) {
        return {
          action: "SELL",
          reason: `利確: 平均取得 ${Math.round(avgBuyPrice).toLocaleString()}円 → 現在 ${Math.round(btcPrice).toLocaleString()}円 (+${(changeRate * 100).toFixed(1)}%)`,
        };
      }
      if (changeRate <= STOP_LOSS_RATE) {
        return {
          action: "SELL",
          reason: `損切り: 平均取得 ${Math.round(avgBuyPrice).toLocaleString()}円 → 現在 ${Math.round(btcPrice).toLocaleString()}円 (${(changeRate * 100).toFixed(1)}%)`,
        };
      }
    }
  }

  // ポジティブニュース × 現金あり → ドルコスト平均法で購入
  if (newsSentiment !== "negative" && ledger.cashYen >= 1000) {
    const tradeYen = Math.min(MAX_TRADE_YEN, ledger.cashYen);
    return {
      action: "BUY",
      reason: `DCA購入: ニュースセンチメント=${newsSentiment}、${tradeYen.toLocaleString()}円分`,
      amountJpy: tradeYen,
    };
  }

  return { action: "HOLD", reason: "取引条件なし（HOLD）" };
}

/**
 * ニュースの要約からセンチメントを判定する（LLM 不要の簡易版）
 */
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

  // bitFlyer 未設定 → 初期台帳を返す（入金待ちモード）
  if (!isBitFlyerEnabled()) {
    const base = input.ledger ?? buildInitialLedger(medalUnits);
    return {
      ...base,
      medalUnits,
      status: "waiting-spec",
      solComment: "bitFlyer API キーが設定されていない。環境変数 BITFLYER_API_KEY / BITFLYER_API_SECRET を設定してくれ。",
      lunaComment: "入金後に BITFLYER_API_KEY を SWA 環境変数へ。設定が来たら即実行に移るわ。",
      updatedAt: new Date().toISOString(),
    };
  }

  // 実際の残高・価格を取得
  const [balance, btcPrice] = await Promise.all([getBitFlyerBalance(), getBtcPrice()]);
  const totalYen = Math.round(balance.cashYen + balance.btcHeld * btcPrice);

  let ledger = input.ledger ?? buildInitialLedger(medalUnits);
  ledger = rolloverMonthIfNeeded({ ...ledger, totalYen, btcPriceYen: btcPrice, ...balance });
  ledger = { ...ledger, medalUnits };

  const sentiment = inferNewsSentiment(input.newsSummary);
  const decision = decideTrade(ledger, btcPrice, sentiment);

  let newTrades = [...ledger.trades];
  let monthlyPnl = ledger.monthlyRealizedPnlYen;
  let updatedBalance = balance;

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
      reason: "dca",
      briefingId: input.briefingId,
    };
    newTrades = [...newTrades.slice(-29), trade]; // 直近30件
    // 残高を再取得
    updatedBalance = await getBitFlyerBalance();
  } else if (decision.action === "SELL" && ledger.btcHeld > MIN_BTC_ORDER) {
    const sellValueJpy = Math.round(ledger.btcHeld * btcPrice);
    // 平均取得原価を計算して損益確定
    const buyTrades = newTrades.filter((t) => t.side === "BUY");
    const avgBuyPrice =
      buyTrades.length > 0
        ? buyTrades.reduce((s, t) => s + t.priceBtc * t.sizeJpy, 0) /
          buyTrades.reduce((s, t) => s + t.sizeJpy, 0)
        : btcPrice;
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
      reason: decision.reason.startsWith("利確") ? "take-profit" : "stop-loss",
      briefingId: input.briefingId,
    };
    newTrades = [...newTrades.slice(-29), trade];
    updatedBalance = await getBitFlyerBalance();
  }

  // おやすみモード判定
  const sleepMode = monthlyPnl >= ledger.monthlyTargetYen;
  const updatedTotal = Math.round(updatedBalance.cashYen + updatedBalance.btcHeld * btcPrice);

  const solComments: Record<string, string> = {
    BUY: `${decision.amountJpy?.toLocaleString()}円分 BTC を ${btcPrice.toLocaleString()}円で分散購入。ニュース: ${sentiment}。`,
    SELL: `${decision.reason}。利益確定完了。今月累計 ${monthlyPnl.toLocaleString()}円。`,
    HOLD: `今日は動かない。${decision.reason}。BTC: ${btcPrice.toLocaleString()}円。`,
  };
  const lunaComments: Record<string, string> = {
    BUY: `最大 ${MAX_TRADE_YEN.toLocaleString()}円ルール守って購入。現金残 ${updatedBalance.cashYen.toLocaleString()}円。${sleepMode ? "月目標達成！おやすみモードへ。" : ""}`,
    SELL: `${decision.reason.startsWith("利確") ? "利確成功" : "損切り実行"}。次のエントリーを待つわ。`,
    HOLD: `${sleepMode ? "おやすみモード中。今月の利益は守りきる。" : "条件未達。翌日に備えて。"}`,
  };

  return {
    ...ledger,
    cashYen: updatedBalance.cashYen,
    btcHeld: updatedBalance.btcHeld,
    btcPriceYen: btcPrice,
    totalYen: updatedTotal,
    monthlyRealizedPnlYen: monthlyPnl,
    sleepMode,
    trades: newTrades,
    status: "done",
    solComment: solComments[decision.action],
    lunaComment: lunaComments[decision.action],
    updatedAt: new Date().toISOString(),
  };
}
