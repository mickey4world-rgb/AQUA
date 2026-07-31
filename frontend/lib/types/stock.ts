export interface StockWatch {
  id: string;
  userId: string;
  ticker: string;
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
  buyPrice: number;
  shares?: number;
  targetMultiplier?: number;
  memo?: string;
}

export interface UpdateStockWatchRequest {
  buyPrice?: number;
  shares?: number;
  targetMultiplier?: number;
  memo?: string;
  isActive?: boolean;
}

export type AdviceAction = "hold" | "buy" | "sell" | "watch";

export interface StockAdvice {
  ticker: string;
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
  fetchedAt: string;
}

export interface StockWatchWithAdvice extends StockWatch {
  advice?: StockAdvice;
}
