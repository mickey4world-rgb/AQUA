export type StockMarket = "us" | "jp";

export type AdviceAction = "hold" | "buy" | "sell" | "watch";

export interface StockWatch {
  id: string;
  userId: string;
  ticker: string;
  market: StockMarket;
  name?: string;
  buyPrice: number;
  shares: number;
  targetMultiplier: number;
  targetPrice: number;
  memo?: string;
  isActive: boolean;
  /** 直近のメール通知アクション（sell など） */
  lastNotifyAction?: AdviceAction;
  /** 直近のメール通知時刻（ISO） */
  lastNotifyAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockWatchRequest {
  ticker: string;
  market?: StockMarket;
  name?: string;
  buyPrice: number;
  shares?: number;
  targetMultiplier?: number;
  memo?: string;
}

export interface UpdateStockWatchRequest {
  name?: string;
  market?: StockMarket;
  buyPrice?: number;
  shares?: number;
  targetMultiplier?: number;
  memo?: string;
  isActive?: boolean;
  lastNotifyAction?: AdviceAction;
  lastNotifyAt?: string;
}

export interface PriceChangeContext {
  title: string;
  source?: string;
  publishedAt?: string;
  link?: string;
  kind: "news" | "development";
}

export interface AiStockInsight {
  available: boolean;
  model?: string;
  headline?: string;
  commentary?: string;
  actionRationale?: string;
  risks?: string[];
  catalysts?: string[];
  confidence?: "high" | "medium" | "low";
  generatedAt?: string;
  reason?: string;
}

export interface StockAdvice {
  ticker: string;
  market: StockMarket;
  currency: "USD" | "JPY";
  companyName?: string;
  currentPrice: number;
  previousClose: number;
  changePct: number;
  ma5: number;
  ma25: number;
  /** 短期MA/EMAからの乖離率（%） */
  ma5DeviationPct?: number;
  /** 長期MA/EMAからの乖離率（%） */
  ma25DeviationPct?: number;
  /** EMA（売買判定用・直近重視） */
  ema5?: number;
  ema25?: number;
  ema75?: number;
  emaCross?: "golden" | "dead" | "none";
  /** EMA5>25>75 */
  perfectOrder?: boolean;
  atr14?: number;
  /** 直近ATR ÷ 直前ATR（>1でボラ拡大） */
  atrRatio?: number;
  bbRegime?: "squeeze" | "expansion" | "normal";
  rsi14?: number;
  bollingerWidthPct?: number;
  macdCross?: "golden" | "dead" | "none";
  volumeSpikeRatio?: number;
  /** モメンタム買いに必要な出来高を満たすか */
  volumeConfirmed?: boolean;
  /** PER など取得できたときのみ */
  trailingPe?: number | null;
  priceToBook?: number | null;
  dividendYieldPct?: number | null;
  trend: "bullish" | "bearish";
  buyPrice: number;
  targetPrice: number;
  profitPct: number;
  distanceToTargetPct: number;
  action: AdviceAction;
  summary: string;
  reasons: string[];
  priceChangeContext: PriceChangeContext[];
  aiInsight?: AiStockInsight;
  fetchedAt: string;
  /** 週次安値ゾーン内（自動売買の安値買い候補） */
  nearWeekLow?: boolean;
  /** 月次安値ゾーン内 */
  nearMonthLow?: boolean;
  /** 安値買い候補か（売り優先・イベント回避後） */
  dipBuyEligible?: boolean;
  /** 安値の深さスコア（高いほど優先。1日あたり採用上限あり） */
  dipScore?: number;
}

export interface StockWatchWithAdvice extends StockWatch {
  advice?: StockAdvice;
}
