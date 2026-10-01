/**
 * 日本株 3層ガードレール（添付設計）
 * 第1層: 1取引あたり最大損失
 * 第2層: 月次最大許容損失 → 当月取引停止
 * 第3層: 通算最大許容損失 → 全決済＋売買権限停止
 */
import {
  STOCK_CUMULATIVE_MAX_LOSS_YEN,
  STOCK_HARD_STOP_LOSS_RATE,
  STOCK_MONTHLY_MAX_LOSS_YEN,
  STOCK_PER_TRADE_MAX_LOSS_YEN,
} from "@/lib/stock-trade-constants";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

export type StockGuardrailLayer = 1 | 2 | 3;

export type StockGuardrailStatus = {
  perTradeMaxLossYen: number;
  monthlyMaxLossYen: number;
  cumulativeMaxLossYen: number;
  /** 当月の実現損益（売り累計） */
  monthlyRealizedPnlYen: number;
  /** 通算の実現損益 */
  cumulativeRealizedPnlYen: number;
  /** 当月の実現損失額（正の数） */
  monthlyLossYen: number;
  /** 通算の実現損失額（正の数・累計がマイナスのとき） */
  cumulativeLossYen: number;
  /** 第2層: 当月の新規売買停止（硬損切り・第3層決済は例外） */
  monthlyHalt: boolean;
  /** 第3層: メインブレーカー */
  mainBreaker: boolean;
  notes: string[];
};

function jstDayId(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function jstMonthPrefix(iso: string): string {
  return jstDayId(iso).slice(0, 7);
}

function sumSellPnl(
  orders: StockBrokerOrderRecord[],
  pred: (o: StockBrokerOrderRecord) => boolean,
): number {
  return orders
    .filter(
      (o) =>
        o.side === "sell" &&
        (o.status === "dry_run" || o.status === "submitted") &&
        pred(o),
    )
    .reduce((s, o) => s + (Number(o.realizedPnlYen) || 0), 0);
}

export function evaluateStockGuardrails(input: {
  orders: StockBrokerOrderRecord[];
  nowIso?: string;
  tradingHalted?: boolean;
}): StockGuardrailStatus {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const month = jstMonthPrefix(nowIso);

  const monthlyRealizedPnlYen = Math.round(
    sumSellPnl(input.orders, (o) => jstMonthPrefix(o.createdAt) === month),
  );
  const cumulativeRealizedPnlYen = Math.round(
    sumSellPnl(input.orders, () => true),
  );

  const monthlyLossYen = Math.max(0, -monthlyRealizedPnlYen);
  const cumulativeLossYen = Math.max(0, -cumulativeRealizedPnlYen);

  const monthlyHalt = monthlyLossYen >= STOCK_MONTHLY_MAX_LOSS_YEN;
  const mainBreaker =
    Boolean(input.tradingHalted) ||
    cumulativeLossYen >= STOCK_CUMULATIVE_MAX_LOSS_YEN;

  const notes: string[] = [];
  if (monthlyHalt) {
    notes.push(
      `第2層: 当月実現損失 ${monthlyLossYen.toLocaleString("ja-JP")}円 ≥ ${STOCK_MONTHLY_MAX_LOSS_YEN.toLocaleString("ja-JP")}円 → 当月の自動売買停止`,
    );
  }
  if (mainBreaker) {
    notes.push(
      `第3層: 通算実現損失 ${cumulativeLossYen.toLocaleString("ja-JP")}円 ≥ ${STOCK_CUMULATIVE_MAX_LOSS_YEN.toLocaleString("ja-JP")}円 → 全決済＋売買権限停止`,
    );
  }

  return {
    perTradeMaxLossYen: STOCK_PER_TRADE_MAX_LOSS_YEN,
    monthlyMaxLossYen: STOCK_MONTHLY_MAX_LOSS_YEN,
    cumulativeMaxLossYen: STOCK_CUMULATIVE_MAX_LOSS_YEN,
    monthlyRealizedPnlYen,
    cumulativeRealizedPnlYen,
    monthlyLossYen,
    cumulativeLossYen,
    monthlyHalt,
    mainBreaker,
    notes,
  };
}

/** 第1層: 建玉が損切り到達時に損失円が上限を超えないよう想定建玉上限 */
export function maxNotionalForPerTradeLoss(
  stopRate = STOCK_HARD_STOP_LOSS_RATE,
  maxLossYen = STOCK_PER_TRADE_MAX_LOSS_YEN,
): number {
  const absRate = Math.abs(stopRate);
  if (absRate <= 0) return maxLossYen;
  return Math.floor(maxLossYen / absRate);
}

/** 含み損（円）が第1層を超えたか */
export function isPerTradeLossBreached(input: {
  buyPrice: number;
  currentPrice: number;
  qty: number;
  maxLossYen?: number;
  stopRate?: number;
}): boolean {
  const maxLoss = input.maxLossYen ?? STOCK_PER_TRADE_MAX_LOSS_YEN;
  const stopRate = input.stopRate ?? STOCK_HARD_STOP_LOSS_RATE;
  if (input.buyPrice <= 0 || input.qty <= 0) return false;
  const unrealized =
    (input.currentPrice - input.buyPrice) * input.qty;
  if (unrealized <= -maxLoss) return true;
  const pct = (input.currentPrice - input.buyPrice) / input.buyPrice;
  return pct <= stopRate;
}
