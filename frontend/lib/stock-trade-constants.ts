/**
 * 日本株・自動資産運用（kabu）定数。
 * /stocks（米国株）とは別系統。検証 dry-run 既定。
 */
export const STOCK_LOT_SIZE = 100;

/** 運用元本の目安（円） */
export const STOCK_PRINCIPAL_YEN = 800_000;

/**
 * 月次売り益目標 = 元本 × この比率（以上）。
 * 日本株は100株単位で利益が大きくなりやすいため 2%（80万なら 16,000円/月）。
 */
export const STOCK_MONTHLY_SELL_PROFIT_TARGET_RATE = 0.02;

export const STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN = Math.round(
  STOCK_PRINCIPAL_YEN * STOCK_MONTHLY_SELL_PROFIT_TARGET_RATE,
);

/** 1インテントあたり買付概算上限（円）— 通常モード */
export const STOCK_MAX_TRADE_YEN = 500_000;

/** 現金がこの額を下回ったら少額投資モード（#21） */
export const STOCK_SMALL_INVEST_CASH_FLOOR_YEN = 300_000;

/** 少額投資モード時の1インテント上限（円） */
export const STOCK_SMALL_TRADE_YEN = 50_000;

/** JST 1日あたりの買付シミュレーション合計上限（円） */
export const STOCK_MAX_DAILY_BUY_YEN = 600_000;

/** 余力のうち常に残す現金比率（買付後） */
export const STOCK_MIN_CASH_RATIO = 0.15;

/** 1銘柄の時価が（余力+保有概算）に占める上限 */
export const STOCK_MAX_SINGLE_ASSET_RATIO = 0.35;

/** 日本株アクティブウォッチ上限 */
export const STOCK_MAX_ACTIVE_JP_WATCHES = 20;

/** bridge 1注文あたり株数上限 */
export const STOCK_MAX_QTY_PER_ORDER = 200;

/** ハード利確: ウォッチ目標倍率 */
export const STOCK_HARD_TAKE_PROFIT_MULT = 1.2;

export const STOCK_SOFT_SELL_VIA_AI = true;

/** 監査AI: 同因が月内この回数以上で条件候補に昇格 */
export const STOCK_AUDIT_PROMOTE_THRESHOLD = 2;

/** 折れ線に残す日次ポイント上限 */
export const STOCK_MAX_EQUITY_POINTS = 120;
