/**
 * 買い Path A / #45 の判定ヘルパー（ユニットテスト用に純関数化）。
 */
import { STOCK_RSI_OVERSOLD } from "@/lib/stock-trade-constants";

/** #8 部分解禁: 下降でも RSI 売られすぎ + 週/月安値なら Path A 買い可 */
export function isBearishDipBounceBuy(advice: {
  action?: string;
  trend?: string;
  rsi14?: number;
  nearWeekLow?: boolean;
  nearMonthLow?: boolean;
  dipBuyEligible?: boolean;
}): boolean {
  if (advice.action !== "buy") return false;
  if (advice.trend !== "bearish") return false;
  if ((advice.rsi14 ?? 100) > STOCK_RSI_OVERSOLD) return false;
  if (!(advice.nearWeekLow || advice.nearMonthLow || advice.dipBuyEligible)) {
    return false;
  }
  return true;
}

/** Path A: 従来の buy+強気、または #8 部分解禁 */
export function isTrendPathBuyEligible(advice: {
  action?: string;
  trend?: string;
  rsi14?: number;
  nearWeekLow?: boolean;
  nearMonthLow?: boolean;
  dipBuyEligible?: boolean;
}): boolean {
  if (advice.action !== "buy") return false;
  if (advice.trend === "bullish") return true;
  return isBearishDipBounceBuy(advice);
}

/**
 * 少額モードの買付上限（円）。
 * 安値ゾーン(#44)は1単元まで枠を引き上げ可。
 */
export function smallInvestBuyCapYen(input: {
  smallInvestMode: boolean;
  mode: "trend" | "dip";
  price: number;
  smallTradeYen: number;
  lotSize: number;
  allowDipOneLot: boolean;
}): number {
  if (!input.smallInvestMode) return Number.POSITIVE_INFINITY;
  if (
    input.mode === "dip" &&
    input.allowDipOneLot &&
    input.price > 0
  ) {
    return Math.max(input.smallTradeYen, input.price * input.lotSize);
  }
  return input.smallTradeYen;
}
