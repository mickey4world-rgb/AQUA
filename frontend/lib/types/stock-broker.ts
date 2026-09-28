/** 証券ブリッジ同期（Phase1: 照会のみ。発注データは扱わない） */

export type StockBrokerKind = "kabu";

export interface StockBrokerHolding {
  symbol: string;
  symbolName: string;
  exchange: number;
  qty: number;
  price: number;
  side?: string;
  accountType?: number;
}

export interface StockBrokerCash {
  stockAccountWallet: number;
  auKCStockAuShareWallet?: number;
  auPayCardWallet?: number;
}

export interface StockBrokerSnapshot {
  id: string;
  userId: string;
  broker: StockBrokerKind;
  syncedAt: string;
  cash: StockBrokerCash;
  holdings: StockBrokerHolding[];
  rawPositionCount: number;
  updatedAt: string;
}

export interface StockBrokerSyncPayload {
  userId: string;
  broker?: StockBrokerKind;
  syncedAt?: string;
  cash: StockBrokerCash;
  holdings: StockBrokerHolding[];
  rawPositionCount?: number;
}
