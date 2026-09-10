/**
 * 資産運用エンジンと条件カタログが共有する定数（クライアント可）
 */
export const ASSET_PRINCIPAL_YEN = 100_000;
export const MIN_MONTHLY_TARGET_YEN = 2_000;
export const MAX_TRADE_YEN = 10_000;
export const HARD_TAKE_PROFIT_RATE = 0.055;
export const SOFT_TAKE_PROFIT_RATE = 0.035;
export const HARD_STOP_LOSS_RATE = -0.25;
export const SOFT_STOP_LOSS_RATE = -0.15;
export const NO_STOP_LOSS_BELOW_CASH_YEN = 500_000;
export const MIN_HOLD_BEFORE_SOFT_STOP_MS = 30 * 24 * 60 * 60 * 1000;
export const LONG_TERM_RECOVERY_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;
export const MONTHLY_TARGET_RATE = 0.02;
export const SLEEP_MODE_RATE = 0.1;
export const BUY_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const MAX_DAILY_BUY_YEN = 20_000;
export const MAX_SPREAD_BPS = 12;
export const BULLISH_SCORE = 28;
export const STRONG_BULLISH_SCORE = 55;
export const MIN_CASH_RATIO = 0.28;
export const MAX_SINGLE_ASSET_RATIO = 0.42;
export const MAX_CRYPTO_RATIO = 0.72;

export const TRADEABLE_PRODUCTS = ["BTC_JPY", "ETH_JPY", "XRP_JPY", "XLM_JPY"] as const;
export type TradeableProduct = (typeof TRADEABLE_PRODUCTS)[number];
