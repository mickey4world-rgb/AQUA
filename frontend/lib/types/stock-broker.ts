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

export interface StockBrokerBridgeMeta {
  /** VM の KABU_ALLOW_LIVE_ORDERS=1 */
  allowLiveOrders: boolean;
  /** 例: http://localhost:18080 */
  kabuBaseUrl?: string;
  /** 18080=本番API / 18081=検証API */
  kabuPort?: number;
  /** localhost の kabu HTTP に届いたか */
  stationReachable?: boolean;
  /** API パスワードでトークン取得できたか（＝ログイン／API有効） */
  stationTokenOk?: boolean;
  /** 直近ヘルス／sync 失敗理由（短文） */
  lastError?: string | null;
  /** ヘルス報告時刻（失敗時も更新。sync 成功時は syncedAt と近い） */
  healthReportedAt?: string;
  /**
   * VM 自動判断の結果。
   * ok / soft_ok / restarted_ok / needs_otp / cooldown_skip / unknown
   */
  recoveryStatus?: string;
  /** 最後に取った自動回復アクション（soft_wait / station_restart / …） */
  recoveryAction?: string;
  recoveryAt?: string;
}

export interface StockBrokerSnapshot {
  id: string;
  userId: string;
  broker: StockBrokerKind;
  syncedAt: string;
  cash: StockBrokerCash;
  holdings: StockBrokerHolding[];
  rawPositionCount: number;
  /** bridge sync 時の LIVE / ポート状態（無い旧スナップショットあり） */
  bridgeMeta?: StockBrokerBridgeMeta;
  updatedAt: string;
}

export interface StockBrokerSyncPayload {
  userId: string;
  broker?: StockBrokerKind;
  syncedAt?: string;
  cash: StockBrokerCash;
  holdings: StockBrokerHolding[];
  rawPositionCount?: number;
  bridgeMeta?: StockBrokerBridgeMeta;
}
