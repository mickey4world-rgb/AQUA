/**
 * 日本株・自動資産運用（kabu）定数。
 * /stocks（米国株ウォッチ）とは別系統。検証 dry-run 既定。
 */
export const STOCK_LOT_SIZE = 100;

/** 運用元本の目安（円）— リスク表示・目標計算用 */
export const STOCK_PRINCIPAL_YEN = 800_000;

/** 毎月の「売り」実現益の目標（円） */
export const STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN = 20_000;

/** 1インテントあたり買付概算上限（円） */
export const STOCK_MAX_TRADE_YEN = 500_000;

/** JST 1日あたりの買付シミュレーション合計上限（円） */
export const STOCK_MAX_DAILY_BUY_YEN = 600_000;

/** 余力のうち常に残す現金比率（買付後） */
export const STOCK_MIN_CASH_RATIO = 0.15;

/** 1銘柄の時価が（余力+保有概算）に占める上限 */
export const STOCK_MAX_SINGLE_ASSET_RATIO = 0.35;

/** 日本株アクティブウォッチ上限（自動運用シミュレーション対象） */
export const STOCK_MAX_ACTIVE_JP_WATCHES = 20;

/** bridge 1注文あたり株数上限（env KABU_MAX_QTY_PER_ORDER で上書き可） */
export const STOCK_MAX_QTY_PER_ORDER = 200;

/** ハード利確: ウォッチ目標倍率に到達で売り検討 */
export const STOCK_HARD_TAKE_PROFIT_MULT = 1.2;

/** ソフト利確寄り: AI sell を採用 */
export const STOCK_SOFT_SELL_VIA_AI = true;

/** 月次売り益目標到達後は新規買いを見送り（売りは継続） */
export const STOCK_PAUSE_BUYS_AFTER_MONTHLY_SELL_TARGET = true;
