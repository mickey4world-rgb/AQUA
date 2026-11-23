/**
 * 月次「少額でも利確できる株を必ず1つ」＋「当月の売り益目標に向けて刈り取る」。
 *
 * 不変条件（自動化）:
 * - アクティブ監視に、単元が回せて 1% 動で小利が取れる銘柄を最低1つ含める
 * - 当月の売り実現益が目標未満なら、その銘柄（月末はプラス圏全銘柄）を利確候補にする
 *
 * 注意: 相場は利益を約束できない。これは「売買せずに月を終える／利確候補ゼロ」を防ぐ設計。
 */
import {
  STOCK_LOT_SIZE,
  STOCK_MAX_POSITION_PCT_OF_PRINCIPAL,
  STOCK_MAX_TRADE_YEN,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PRINCIPAL_YEN,
} from "@/lib/stock-trade-constants";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

/** sell-policy の STOCK_MIN_TAKE_PROFIT_RATE と揃える（循環 import 回避） */
const DEFAULT_MIN_TAKE_PROFIT_RATE = 0.005;

/** 1% 動いたときの単元利益の下限（円）— これ未満は「少額利確」向きでない */
export const STOCK_MONTHLY_HARVEST_MIN_YEN_AT_1PCT = 400;

/** 1% 動いたときの単元利益の上限（円）— 厚すぎると回転しにくい */
export const STOCK_MONTHLY_HARVEST_MAX_YEN_AT_1PCT = 25_000;

/** 月末何日前から「未達ならプラス圏を広く刈る」 */
export const STOCK_MONTHLY_HARVEST_URGENT_DAYS_LEFT = 5;

/** 当月まだ売り益ゼロなら、この日以降は緊急扱い */
export const STOCK_MONTHLY_HARVEST_ZERO_PROFIT_URGENT_DAY = 15;

function jstDayId(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export function jstMonthPrefix(isoOrDate: string | Date): string {
  return jstDayId(isoOrDate).slice(0, 7);
}

export function jstMonthCalendar(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  daysInMonth: number;
  daysLeft: number;
  monthPrefix: string;
} {
  const dayId = jstDayId(now);
  const [ys, ms, ds] = dayId.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  // Date.UTC の monthIndex+1, day 0 = 当月末
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    day,
    daysInMonth,
    daysLeft: Math.max(0, daysInMonth - day),
    monthPrefix: dayId.slice(0, 7),
  };
}

export function jpLotYen(price: number): number {
  return Math.round(Math.max(0, price) * STOCK_LOT_SIZE);
}

export function isJpLotAffordable(price: number): boolean {
  if (!(price > 0)) return false;
  const lot = jpLotYen(price);
  const maxPos = STOCK_PRINCIPAL_YEN * STOCK_MAX_POSITION_PCT_OF_PRINCIPAL;
  return lot <= STOCK_MAX_TRADE_YEN && lot <= maxPos;
}

/** 1% 上昇時の単元あたり概算利益（円） */
export function yenAtOnePercentMove(price: number): number {
  return Math.round(jpLotYen(price) * 0.01);
}

/**
 * 「少量でも利益を取りやすい」月次エンジン候補か。
 * 単元が買えて、1% 動で数百〜2.5万円程度の利確が見える銘柄。
 */
export function isMonthlyHarvestCandidate(price: number): boolean {
  if (!isJpLotAffordable(price)) return false;
  const yen = yenAtOnePercentMove(price);
  return (
    yen >= STOCK_MONTHLY_HARVEST_MIN_YEN_AT_1PCT &&
    yen <= STOCK_MONTHLY_HARVEST_MAX_YEN_AT_1PCT
  );
}

export function monthToDateSellProfitYen(
  orders: StockBrokerOrderRecord[],
  now: Date = new Date(),
): number {
  const month = jstMonthPrefix(now);
  return Math.round(
    orders
      .filter(
        (o) =>
          o.side === "sell" &&
          (o.status === "submitted" || o.status === "dry_run") &&
          jstMonthPrefix(o.createdAt) === month,
      )
      .reduce((sum, o) => sum + (Number(o.realizedPnlYen) || 0), 0),
  );
}

export function monthToDateTradeCount(
  orders: StockBrokerOrderRecord[],
  now: Date = new Date(),
): number {
  const month = jstMonthPrefix(now);
  return orders.filter(
    (o) =>
      (o.status === "submitted" || o.status === "dry_run") &&
      jstMonthPrefix(o.createdAt) === month,
  ).length;
}

export type MonthlyHarvestStatus = {
  monthPrefix: string;
  realizedSellProfitYen: number;
  targetYen: number;
  remainingYen: number;
  needed: boolean;
  urgent: boolean;
  tradeCount: number;
  daysLeft: number;
  day: number;
};

export function evaluateMonthlyHarvestStatus(input: {
  orders: StockBrokerOrderRecord[];
  now?: Date;
  targetYen?: number;
}): MonthlyHarvestStatus {
  const now = input.now ?? new Date();
  const cal = jstMonthCalendar(now);
  const targetYen = input.targetYen ?? STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN;
  const realizedSellProfitYen = monthToDateSellProfitYen(input.orders, now);
  const tradeCount = monthToDateTradeCount(input.orders, now);
  const remainingYen = Math.max(0, targetYen - realizedSellProfitYen);
  const needed = realizedSellProfitYen < targetYen;
  const urgent =
    needed &&
    (cal.daysLeft <= STOCK_MONTHLY_HARVEST_URGENT_DAYS_LEFT ||
      (realizedSellProfitYen <= 0 &&
        cal.day >= STOCK_MONTHLY_HARVEST_ZERO_PROFIT_URGENT_DAY) ||
      (tradeCount === 0 && cal.day >= 7));

  return {
    monthPrefix: cal.monthPrefix,
    realizedSellProfitYen,
    targetYen,
    remainingYen,
    needed,
    urgent,
    tradeCount,
    daysLeft: cal.daysLeft,
    day: cal.day,
  };
}

/**
 * 月次刈り取り売りを出してよいか（プラス圏のみ。赤字売りは禁止）。
 */
export function shouldMonthlyHarvestSell(input: {
  changeRate: number;
  isHarvestCandidate: boolean;
  status: Pick<MonthlyHarvestStatus, "needed" | "urgent">;
  minTakeProfitRate?: number;
}): boolean {
  const minRate = input.minTakeProfitRate ?? DEFAULT_MIN_TAKE_PROFIT_RATE;
  if (!input.status.needed) return false;
  if (input.changeRate < minRate) return false;
  if (input.status.urgent) return true;
  return input.isHarvestCandidate;
}

/**
 * 週次アクティブ集合に、月次エンジン銘柄が1つも無ければ強制で入れる。
 */
export function ensureMonthlyHarvestInActiveCodes(input: {
  desiredActiveCodes: string[];
  candidates: Array<{ code: string; price: number; score: number }>;
  targetActive: number;
  protectedCodes?: Set<string>;
}): { codes: string[]; injectedCode: string | null } {
  const has = input.desiredActiveCodes.some((code) => {
    const row = input.candidates.find((c) => c.code === code);
    return row ? isMonthlyHarvestCandidate(row.price) : false;
  });
  if (has) return { codes: [...input.desiredActiveCodes], injectedCode: null };

  const best = [...input.candidates]
    .filter((c) => isMonthlyHarvestCandidate(c.price))
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return { codes: [...input.desiredActiveCodes], injectedCode: null };

  const codes = [...input.desiredActiveCodes];
  if (!codes.includes(best.code)) codes.push(best.code);

  const protectedCodes = input.protectedCodes ?? new Set<string>();
  while (codes.length > Math.max(input.targetActive, 1)) {
    let removed = false;
    for (let i = codes.length - 1; i >= 0; i -= 1) {
      const code = codes[i]!;
      if (code === best.code) continue;
      if (protectedCodes.has(code)) continue;
      const row = input.candidates.find((c) => c.code === code);
      if (row && isMonthlyHarvestCandidate(row.price)) continue;
      codes.splice(i, 1);
      removed = true;
      break;
    }
    if (!removed) break;
  }

  return { codes, injectedCode: best.code };
}
