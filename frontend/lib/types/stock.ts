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
}

export interface StockWatchWithAdvice extends StockWatch {
  advice?: StockAdvice;
}
