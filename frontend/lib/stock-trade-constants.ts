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

/** 1銘柄への投入が元本に占める上限（ポジションサイジング明示） */
export const STOCK_MAX_POSITION_PCT_OF_PRINCIPAL = 0.35;

/** 日本株アクティブウォッチ上限 */
export const STOCK_MAX_ACTIVE_JP_WATCHES = 20;

/**
 * 監視メモ（非アクティブ）から買い挑戦として分析する上限。
 * アクティブより好条件のときだけ買いインテント対象になる。
 */
export const STOCK_MAX_MEMO_CHALLENGER_WATCHES = 12;

/** bridge 1注文あたり株数上限 */
export const STOCK_MAX_QTY_PER_ORDER = 200;

/** ハード利確: ウォッチ目標倍率 */
export const STOCK_HARD_TAKE_PROFIT_MULT = 1.2;

/** ハード損切り: 取得単価からの下落率（以下で強制売り検討） */
export const STOCK_HARD_STOP_LOSS_RATE = -0.08;

/** ソフト損切り: AI/下降トレンドと合わせて売り検討 */
export const STOCK_SOFT_STOP_LOSS_RATE = -0.05;

/**
 * 1日の実現損失がこの額に達したら新規買い停止（硬損切り売りは例外）。
 * 元本の 1.5% ≈ 12,000円
 */
export const STOCK_DAILY_MAX_LOSS_YEN = Math.round(STOCK_PRINCIPAL_YEN * 0.015);

/**
 * 第1層ガードレール: 1取引あたり最大損失（円）。
 * 推奨 1〜2万（元本の 1.25〜2.5%）→ 中央 1.5万（1.875%）
 */
export const STOCK_PER_TRADE_MAX_LOSS_YEN = 15_000;

/**
 * 第2層: 1ヶ月の最大許容損失（円）。
 * 推奨 4〜5万（5〜6.25%）→ 中央 4.5万（5.625%）
 * 到達で当月の自動売買停止（第3層決済・硬損切りは例外）
 */
export const STOCK_MONTHLY_MAX_LOSS_YEN = 45_000;

/**
 * 第3層: 通算の最大許容損失（円）= メインブレーカー。
 * 累計マイナス 20万円。到達で保有全決済＋売買権限停止。
 */
export const STOCK_CUMULATIVE_MAX_LOSS_YEN = 200_000;

/** 寄り付き直後・大引け間際の取引禁止（分） */
export const STOCK_SESSION_OPEN_BLACKOUT_MIN = 15;
export const STOCK_SESSION_CLOSE_BLACKOUT_MIN = 15;

/** VIX がこの値以上なら新規買い見送り */
export const STOCK_VIX_BUY_BLOCK = 30;

/** 出来高スパイク: 過去5日平均に対する倍率以上で要注意 */
export const STOCK_VOLUME_SPIKE_MULT = 2.5;

/** RSI 過熱 */
export const STOCK_RSI_OVERBOUGHT = 70;
export const STOCK_RSI_OVERSOLD = 30;

/**
 * 安値ゾーン買い（週次・月次の押し目拾い）。
 * 従来の「上昇トレンド＋buy」(#8)と並走。固定件数ではなく、
 * 当日分析対象ウォッチ数に対する割合で安値枠を抑え、残りは #8 のみで判断する。
 */
/** 週次安値の参照日数（営業日） */
export const STOCK_DIP_WEEK_LOOKBACK = 5;
/** 月次安値の参照日数（営業日） */
export const STOCK_DIP_MONTH_LOOKBACK = 20;
/** 週次安値からの許容乖離（この以内ならゾーン内） */
export const STOCK_DIP_NEAR_WEEK_PCT = 0.02;
/** 月次安値からの許容乖離 */
export const STOCK_DIP_NEAR_MONTH_PCT = 0.03;
/** 安値買いを許可する RSI 上限（過熱し始めた反発は従来条件へ譲る） */
export const STOCK_DIP_MAX_RSI = 45;
/**
 * 安値ゾーン買いの枠 = floor(当日ウォッチ数 × この割合)。
 * 例: 4銘柄 → 安値最大2・残り2は従来#8のみ。件数そのものに固定しない。
 */
export const STOCK_DIP_BUY_SHARE_OF_WATCHES = 0.5;

/** 当日の分析対象ウォッチ数から、安値ゾーン買いの採用上限を求める */
export function maxDipBuysForWatchCount(watchCount: number): number {
  if (!(watchCount > 0)) return 0;
  return Math.floor(watchCount * STOCK_DIP_BUY_SHARE_OF_WATCHES);
}

export const STOCK_SOFT_SELL_VIA_AI = true;

/** 監査AI: 同因が月内この回数以上で条件候補に昇格 */
export const STOCK_AUDIT_PROMOTE_THRESHOLD = 2;

/** 折れ線に残す日次ポイント上限 */
export const STOCK_MAX_EQUITY_POINTS = 120;

/**
 * 週末ユニバース見直し: アクティブ目標数（#7 の上限以下）。
 * 利確しやすい単元買い銘柄をこの件数前後に保つ。
 */
export const STOCK_WEEKLY_TARGET_ACTIVE_JP = 8;

/** 週末1回あたりの入れ替え上限（deactivate + activate の組） */
export const STOCK_WEEKLY_MAX_ROTATIONS = 3;

/** 週次採点で「過熱」とみなす直近騰落率（%）— 追撃より押し目待ち */
export const STOCK_WEEKLY_OVERHEAT_CHANGE_PCT = 8;
