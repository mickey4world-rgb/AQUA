/**
 * 株式自動売買（kabu）エンジンと条件カタログが共有する定数（クライアント可）
 * 検証環境・dry-run 既定。LIVE は KABU_ALLOW_LIVE_ORDERS=1 のみ。
 */
export const STOCK_LOT_SIZE = 100;

/** 1回の買付上限（円） */
export const STOCK_MAX_TRADE_YEN = 100_000;

/** JST 1日あたりの買付合計上限（円） */
export const STOCK_MAX_DAILY_BUY_YEN = 300_000;

/** 余力のうち常に残す現金比率（買付後） */
export const STOCK_MIN_CASH_RATIO = 0.15;

/** 1銘柄の時価が（余力+保有概算）に占める上限 */
export const STOCK_MAX_SINGLE_ASSET_RATIO = 0.35;

/** 同時に追う日本株ウォッチ上限（シミュレーション対象） */
export const STOCK_MAX_ACTIVE_JP_WATCHES = 20;

/** bridge 1注文あたり株数上限 */
export const STOCK_MAX_QTY_PER_ORDER = 100;

/** ハード利確: ウォッチ目標倍率に到達で売り検討 */
export const STOCK_HARD_TAKE_PROFIT_MULT = 1.2;

/** ソフト利確寄り: AI sell を採用 */
export const STOCK_SOFT_SELL_VIA_AI = true;
