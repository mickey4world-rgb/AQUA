export type StockMarket = "us" | "jp";

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
}

export type AdviceAction = "hold" | "buy" | "sell" | "watch";

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
