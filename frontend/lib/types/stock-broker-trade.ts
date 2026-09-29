/** 自動発注インテント・約定報告（Phase C） */

export type StockBrokerOrderSide = "sell" | "buy";
export type StockBrokerOrderStatus =
  | "pending"
  | "dry_run"
  | "submitted"
  | "rejected"
  | "skipped";

export interface StockBrokerTradeIntent {
  id: string;
  userId: string;
  side: StockBrokerOrderSide;
  /** kabu Symbol（例: 7203） */
  symbol: string;
  /** Yahoo 等のウォッチ用（例: 7203.T） */
  watchTicker?: string;
  symbolName?: string;
  exchange: number;
  qty: number;
  /** 成行のみ Phase C */
  frontOrderType: 10;
  reason: string;
  /** 適用した売買条件番号（#1〜） */
  ruleIds?: number[];
  watchId?: string;
  adviceAction?: string;
  createdAt: string;
  /** 有効期限（この時刻以降は bridge が無視） */
  expiresAt: string;
}

export interface StockBrokerOrderRecord {
  id: string;
  userId: string;
  intentId: string;
  side: StockBrokerOrderSide;
  symbol: string;
  exchange: number;
  qty: number;
  status: StockBrokerOrderStatus;
  dryRun: boolean;
  reason: string;
  ruleIds?: number[];
  kabuOrderId?: string;
  kabuResultCode?: number | string;
  message?: string;
  createdAt: string;
}
