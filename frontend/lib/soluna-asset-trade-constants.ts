/**
 * 資産運用エンジンと条件カタログが共有する定数（クライアント可）
 */
export const ASSET_PRINCIPAL_YEN = 100_000;
/** 投資開始月（JST）。折れ線の起点・補完に使う */
export const ASSET_START_MONTH = "2026-08";
/** 日次スナップショットの保持上限（約 6〜7 か月） */
export const MAX_EQUITY_SNAPSHOTS = 200;
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

/** 月次利益目標の下限（常に 2,000 円以上） */
export function clampMonthlyTargetYen(targetYen: number | undefined | null): number {
  const n = typeof targetYen === "number" && Number.isFinite(targetYen) ? targetYen : 0;
  return Math.max(MIN_MONTHLY_TARGET_YEN, Math.round(n));
}

/** 月初残高から月次利益目標を算出（×2%、下限 2,000 円） */
export function computeMonthlyTargetYenFromOpening(openingBalanceYen: number): number {
  const opening = Math.max(0, openingBalanceYen);
  return Math.max(MIN_MONTHLY_TARGET_YEN, Math.round(opening * MONTHLY_TARGET_RATE));
}
/** 静かな相場でも再エントリーしやすく（旧 2h） */
export const BUY_COOLDOWN_MS = 75 * 60 * 1000;
export const MAX_DAILY_BUY_YEN = 20_000;
export const MAX_SPREAD_BPS = 14;
/** 旧 28。IV 低位でも買いが絶えないよう基準を下げる */
export const BULLISH_SCORE = 22;
export const STRONG_BULLISH_SCORE = 52;
export const MIN_CASH_RATIO = 0.28;
export const MAX_SINGLE_ASSET_RATIO = 0.42;
export const MAX_CRYPTO_RATIO = 0.72;
/** 防御モード時の買い閾値加算（旧 +12 が静かな月を殺しすぎた） */
export const DEFENSE_BUY_THRESHOLD_BUMP = 5;
/** 閑散相場（全銘柄 |score| が基準未満）のとき閾値を下げる */
export const QUIET_MARKET_BUY_THRESHOLD_RELIEF = 6;

export const TRADEABLE_PRODUCTS = ["BTC_JPY", "ETH_JPY", "XRP_JPY", "XLM_JPY"] as const;
export type TradeableProduct = (typeof TRADEABLE_PRODUCTS)[number];
