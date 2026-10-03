/**
 * 日本株自動運用の条件カタログ（コスト画面・ログの共通番号）
 * /stocks（米国株）とは別。仮想通貨 Soluna と同型の番号付き整理。
 *
 * 分類:
 * - 組み込み（エンジン／分析で強制または強く反映）
 * - 信号（AI・テクニカル入力。単独では発注しない）
 * - 将来（データ源が未接続／不安定のためカタログのみ）
 */
import {
  STOCK_AUDIT_PROMOTE_THRESHOLD,
  STOCK_CUMULATIVE_MAX_LOSS_YEN,
  STOCK_DAILY_MAX_LOSS_YEN,
  STOCK_DIP_MAX_RSI,
  STOCK_DIP_MONTH_LOOKBACK,
  STOCK_DIP_NEAR_MONTH_PCT,
  STOCK_DIP_NEAR_WEEK_PCT,
  STOCK_DIP_BUY_SHARE_OF_WATCHES,
  STOCK_DIP_WEEK_LOOKBACK,
  STOCK_HARD_STOP_LOSS_RATE,
  STOCK_HARD_TAKE_PROFIT_MULT,
  STOCK_LOT_SIZE,
  STOCK_MAX_ACTIVE_JP_WATCHES,
  STOCK_MAX_DAILY_BUY_YEN,
  STOCK_MAX_MEMO_CHALLENGER_WATCHES,
  STOCK_MAX_POSITION_PCT_OF_PRINCIPAL,
  STOCK_MAX_QTY_PER_ORDER,
  STOCK_MAX_SINGLE_ASSET_RATIO,
  STOCK_MAX_TRADE_YEN,
  STOCK_MIN_CASH_RATIO,
  STOCK_MONTHLY_MAX_LOSS_YEN,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_RATE,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PER_TRADE_MAX_LOSS_YEN,
  STOCK_PRINCIPAL_YEN,
  STOCK_RSI_OVERBOUGHT,
  STOCK_RSI_OVERSOLD,
  STOCK_SESSION_CLOSE_BLACKOUT_MIN,
  STOCK_SESSION_OPEN_BLACKOUT_MIN,
  STOCK_SMALL_INVEST_CASH_FLOOR_YEN,
  STOCK_SMALL_TRADE_YEN,
  STOCK_SOFT_STOP_LOSS_RATE,
  STOCK_VIX_BUY_BLOCK,
  STOCK_VOLUME_SPIKE_MULT,
  STOCK_WEEKLY_MAX_ROTATIONS,
  STOCK_WEEKLY_TARGET_ACTIVE_JP,
} from "@/lib/stock-trade-constants";

export type StockTradeRuleCategory =
  | "universe"
  | "risk"
  | "buy"
  | "sell"
  | "mode"
  | "signal"
  | "deferred";

export interface StockTradeRule {
  id: number;
  category: StockTradeRuleCategory;
  title: string;
  summary: string;
}

const pct = (rate: number) =>
  `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export const STOCK_TRADE_RULES: StockTradeRule[] = [
  {
    id: 1,
    category: "universe",
    title: "対象・分離",
    summary: `日本株・現物のみ（kabu）。元本目安 ${yen(STOCK_PRINCIPAL_YEN)}。米国株の「保有株」ページとは別系統。検証ポート 18081 から`,
  },
  {
    id: 2,
    category: "risk",
    title: "1インテント買付上限",
    summary: `1インテントあたり概算 ${yen(STOCK_MAX_TRADE_YEN)} まで（単元 ${STOCK_LOT_SIZE} 株）`,
  },
  {
    id: 3,
    category: "risk",
    title: "日次買付上限",
    summary: `JST 1日の買付シミュレーション合計 ${yen(STOCK_MAX_DAILY_BUY_YEN)} まで`,
  },
  {
    id: 4,
    category: "risk",
    title: "同一intentの再実行禁止",
    summary: "同じ日・同じ銘柄・同じ売買方向の dry-run/発注済は再生成しない",
  },
  {
    id: 5,
    category: "risk",
    title: "現金下限",
    summary: `証券余力の ${pct(STOCK_MIN_CASH_RATIO)} を現金として残し、それを下回る買いは見送り`,
  },
  {
    id: 6,
    category: "risk",
    title: "単一銘柄上限（ポジションサイジング）",
    summary: `1銘柄の想定時価は余力+保有概算の ${pct(STOCK_MAX_SINGLE_ASSET_RATIO)}、かつ元本の ${pct(STOCK_MAX_POSITION_PCT_OF_PRINCIPAL)} まで`,
  },
  {
    id: 7,
    category: "risk",
    title: "ウォッチ数上限",
    summary: `日本株アクティブウォッチは ${STOCK_MAX_ACTIVE_JP_WATCHES} 銘柄までをシミュレーション対象`,
  },
  {
    id: 42,
    category: "universe",
    title: "週末ユニバース自動シード",
    summary: `毎週末に固定候補を利確しやすさ（月次目標までの回転向き）＋News Search 適合で採点し、アクティブ目標 ${STOCK_WEEKLY_TARGET_ACTIVE_JP}・入れ替え最大 ${STOCK_WEEKLY_MAX_ROTATIONS}。単元不可は監視メモ。保有はローテアウトしない`,
  },
  {
    id: 45,
    category: "buy",
    title: "監視メモ好条件チャレンジ",
    summary: `非アクティブ（監視メモ）も最大 ${STOCK_MAX_MEMO_CHALLENGER_WATCHES} 銘柄まで分析し、買いシグナル優先度がアクティブ最良を上回るときだけ買いインテント可。売りは保有があるときのみ`,
  },
  {
    id: 43,
    category: "signal",
    title: "News Search 適合（ソフト）",
    summary:
      "深夜バッチの Works News Search ダイジェストを参照。銘柄タグ×カテゴリ/キーワード一致を週末スコア加点と日次買いの優先順に反映（ヒットなしでも欠測減点はしない）",
  },
  {
    id: 8,
    category: "buy",
    title: "AI買い + 強気トレンド",
    summary:
      "ウォッチAIが buy かつ短期トレンドが強気のとき買いインテントを生成（条件達成銘柄は互いに除外しない）。安値ゾーン買い(#44)とは別枠で並走",
  },
  {
    id: 44,
    category: "buy",
    title: "週次・月次安値ゾーン買い（件数上限）",
    summary: `週安値(${STOCK_DIP_WEEK_LOOKBACK}日)の ${pct(STOCK_DIP_NEAR_WEEK_PCT)} 以内、または月安値(${STOCK_DIP_MONTH_LOOKBACK}日)の ${pct(STOCK_DIP_NEAR_MONTH_PCT)} 以内、かつ RSI≤${STOCK_DIP_MAX_RSI}。下降でも候補になるが採用枠は当日ウォッチ数の約 ${pct(STOCK_DIP_BUY_SHARE_OF_WATCHES)}（floor）まで・スコア順。残り枠は #8 の従来条件のみで判断（全員安値買いしない）`,
  },
  {
    id: 9,
    category: "buy",
    title: "単元株",
    summary: `買付数量は ${STOCK_LOT_SIZE} 株単位。1単元未満は見送り`,
  },
  {
    id: 10,
    category: "buy",
    title: "余力チェック",
    summary: "直近 sync の株式余力で概算コストを賄えない買い見送り",
  },
  {
    id: 11,
    category: "sell",
    title: "硬利確（目標到達）",
    summary: `ウォッチ目標倍率（既定×${STOCK_HARD_TAKE_PROFIT_MULT}）到達で売り検討`,
  },
  {
    id: 12,
    category: "sell",
    title: "ソフト売り（AI sell）",
    summary: "ウォッチAIが sell のとき、保有があれば売りインテント",
  },
  {
    id: 13,
    category: "sell",
    title: "保有なしは売らない",
    summary: "証券同期の保有数量が 0 の銘柄は売りインテントを出さない",
  },
  {
    id: 14,
    category: "sell",
    title: "数量キャップ",
    summary: `1注文あたり最大 ${STOCK_MAX_QTY_PER_ORDER} 株（env KABU_MAX_QTY_PER_ORDER で上書き可）`,
  },
  {
    id: 15,
    category: "mode",
    title: "検証・dry-run 既定",
    summary:
      "KABU_ALLOW_LIVE_ORDERS=1 が無い限り sendorder しない。検証環境で実市場を見ながらログのみ",
  },
  {
    id: 16,
    category: "mode",
    title: "取引時間ゲート",
    summary: `東証セッション（9:00–11:30 / 12:30–15:00 JST）。寄り直後 ${STOCK_SESSION_OPEN_BLACKOUT_MIN} 分・大引け前 ${STOCK_SESSION_CLOSE_BLACKOUT_MIN} 分は禁止（#30）`,
  },
  {
    id: 17,
    category: "mode",
    title: "銘柄ホワイトリスト",
    summary: "KABU_SYMBOL_WHITELIST 指定時はその銘柄のみ（空なら全候補）",
  },
  {
    id: 18,
    category: "mode",
    title: "LIVE 二段ゲート",
    summary: "LIVE 時は取引パスワード必須。検証→本番ポート切替は明示的に行う",
  },
  {
    id: 19,
    category: "buy",
    title: "条件達成銘柄の同時シミュレーション",
    summary:
      "同じ時間帯に複数銘柄が買い/売り条件を満たしたら銘柄同士で競わせず、枠（日次・現金・単元・数量）の範囲で同時にインテント化",
  },
  {
    id: 20,
    category: "mode",
    title: "月次売り益目標",
    summary: `毎月の売り側実現益の合計が元本 ${yen(STOCK_PRINCIPAL_YEN)} の ${(STOCK_MONTHLY_SELL_PROFIT_TARGET_RATE * 100).toFixed(0)}%（${yen(STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN)}）以上を目標。グラフ・達成率の基準`,
  },
  {
    id: 21,
    category: "buy",
    title: "現金薄いときの少額投資",
    summary: `証券余力が ${yen(STOCK_SMALL_INVEST_CASH_FLOOR_YEN)} を下回っても売買は継続。買付は1インテント ${yen(STOCK_SMALL_TRADE_YEN)} までに縮小（売りは通常どおり）`,
  },
  {
    id: 22,
    category: "risk",
    title: "元本対比の過大建玉抑制",
    summary: `1回の買付概算が元本目安 ${yen(STOCK_PRINCIPAL_YEN)} の 70% を超えるインテントは見送り（集中リスク回避）`,
  },
  {
    id: 23,
    category: "mode",
    title: "監査AI",
    summary:
      "売買（dry-run含む）のたびに独立モデルが良い点・反省を記録。会話用モデルとは別系統",
  },
  {
    id: 24,
    category: "mode",
    title: "反省の条件昇格",
    summary: `同じ反省・良い点が月内で ${STOCK_AUDIT_PROMOTE_THRESHOLD} 回以上続いたら、運用バイアス／条件候補に自動追加して次回判断に反映`,
  },
  // --- リスク管理（今回追加・必須） ---
  {
    id: 25,
    category: "sell",
    title: "ハード損切り",
    summary: `取得単価から ${pct(STOCK_HARD_STOP_LOSS_RATE)} 以下で強制売り検討（日次損失CB中でも例外として継続）`,
  },
  {
    id: 26,
    category: "sell",
    title: "ソフト損切り",
    summary: `取得単価から ${pct(STOCK_SOFT_STOP_LOSS_RATE)} 付近かつ下降トレンドなら売り検討（硬損切りの手前）`,
  },
  {
    id: 27,
    category: "risk",
    title: "1日最大損失（サーキットブレーカー）",
    summary: `当日の実現損失合計が ${yen(STOCK_DAILY_MAX_LOSS_YEN)} 以上なら新規買い停止。硬損切り売りのみ例外`,
  },
  {
    id: 28,
    category: "signal",
    title: "テクニカル指標（AIトレンド入力）",
    summary: `SMA乖離・RSI（≥${STOCK_RSI_OVERBOUGHT} 買われすぎ / ≤${STOCK_RSI_OVERSOLD} 売られすぎ）・ボリンジャー幅・MACDクロスを日足から算出し、買い/売り判定とAI解説に渡す`,
  },
  {
    id: 29,
    category: "mode",
    title: "市場環境ゲート（地合い）",
    summary: `VIX≥${STOCK_VIX_BUY_BLOCK} または日経平均が概ね -2.5% 以下の急落地合いでは新規買い見送り。S&P・ナスダック・USD/JPY は参考ログ`,
  },
  {
    id: 30,
    category: "mode",
    title: "寄り・引けの時間帯制限",
    summary: `寄り付き直後 ${STOCK_SESSION_OPEN_BLACKOUT_MIN} 分・大引け前 ${STOCK_SESSION_CLOSE_BLACKOUT_MIN} 分は sessionOpenGuess=false（流動性・値動き荒れ回避）`,
  },
  {
    id: 31,
    category: "buy",
    title: "出来高スパイク警戒",
    summary: `当日出来高が過去5日平均の ${STOCK_VOLUME_SPIKE_MULT} 倍以上かつ下落中は新規買い見送り（約定・需給リスク）`,
  },
  {
    id: 32,
    category: "signal",
    title: "ファンダメンタルズ（参考入力）",
    summary:
      "取得できた PER / PBR / 配当利回りをAI解説と判定理由に添付。同業比較や自己資本比率の硬ゲートはデータ安定化まで行わない",
  },
  {
    id: 33,
    category: "buy",
    title: "決算ニュース回避（暫定）",
    summary:
      "直近ニュース見出しに「決算」「業績」等がある銘柄は新規買いを様子見へ（厳密な発表日カレンダーは将来 #36）",
  },
  {
    id: 34,
    category: "signal",
    title: "ニュース・センチメント（ソフト）",
    summary:
      "価格変動コンテキストのニュースをAI解説に渡し、ポジ/ネガを自然言語で補足。数値スコアの硬ゲートは未実装（トークンコスト優先）",
  },
  // --- 将来（カタログ明示・未強制） ---
  {
    id: 35,
    category: "deferred",
    title: "売買スプレッド（板）",
    summary:
      "最良気配の差が広い銘柄はエントリー禁止 — kabu 板APIの安定取得後に組み込み予定。現状は未強制",
  },
  {
    id: 36,
    category: "deferred",
    title: "決算発表カレンダー",
    summary:
      "発表 N 日前からポジション非保有 — 信頼できるJP決算カレンダー連携後に硬ゲート化。暫定は #33",
  },
  {
    id: 37,
    category: "deferred",
    title: "信用残（買い残・売り残）",
    summary:
      "将来の決済売り圧力の監視 — 無料で安定した信用残フィードが無いため未強制",
  },
  {
    id: 38,
    category: "deferred",
    title: "EPS成長・自己資本比率の硬ゲート",
    summary:
      "コンセンサス超えや財務健全性の数値ゲート — 安定したファンダAPI確保後。現状は #32 の参考表示のみ",
  },
  // --- 3層ガードレール（添付設計） ---
  {
    id: 39,
    category: "risk",
    title: "第1層: 1取引あたり最大損失",
    summary: `1トレードの想定損失を ${yen(STOCK_PER_TRADE_MAX_LOSS_YEN)}（元本の約 ${((STOCK_PER_TRADE_MAX_LOSS_YEN / STOCK_PRINCIPAL_YEN) * 100).toFixed(2)}%）までに制限。含み損がこの額または ${pct(STOCK_HARD_STOP_LOSS_RATE)} に達したら強制売り検討。建玉も損切り到達時の損失がこの額を超えないよう縮小`,
  },
  {
    id: 40,
    category: "risk",
    title: "第2層: 1ヶ月の最大許容損失",
    summary: `当月の実現損失合計が ${yen(STOCK_MONTHLY_MAX_LOSS_YEN)}（元本の約 ${((STOCK_MONTHLY_MAX_LOSS_YEN / STOCK_PRINCIPAL_YEN) * 100).toFixed(2)}%）以上なら当月の自動売買を停止。連敗・暴落相場での出血を止める`,
  },
  {
    id: 41,
    category: "risk",
    title: "第3層: 通算最大許容損失（メインブレーカー）",
    summary: `通算の実現損失が ${yen(STOCK_CUMULATIVE_MAX_LOSS_YEN)} に達したら保有を全決済し、AIの売買権限を停止（手動解除まで）。アプリ全体の最終ブレーカー`,
  },
];

export function stockTradeRuleById(id: number): StockTradeRule | undefined {
  return STOCK_TRADE_RULES.find((r) => r.id === id);
}

export function stockCategoryLabelJa(category: StockTradeRuleCategory): string {
  switch (category) {
    case "universe":
      return "対象";
    case "risk":
      return "リスク上限";
    case "buy":
      return "買い条件";
    case "sell":
      return "売り条件";
    case "mode":
      return "運用モード";
    case "signal":
      return "AI・信号入力";
    case "deferred":
      return "将来（未強制）";
    default:
      return category;
  }
}

export function formatStockTradeReasonWithRules(
  reason: string,
  ruleIds?: number[] | null,
): string {
  const ids =
    ruleIds && ruleIds.length > 0
      ? [...new Set(ruleIds)].sort((a, b) => a - b)
      : [];
  const idLabel = ids.length > 0 ? ids.map((id) => `#${id}`).join("+") : null;
  if (idLabel && reason) return `${idLabel} · ${reason}`;
  if (idLabel) return idLabel;
  return reason || "—";
}

export function stockTradeRulesForApi() {
  return STOCK_TRADE_RULES.map((rule) => ({
    id: rule.id,
    category: rule.category,
    categoryLabel: stockCategoryLabelJa(rule.category),
    title: rule.title,
    summary: rule.summary,
  }));
}
