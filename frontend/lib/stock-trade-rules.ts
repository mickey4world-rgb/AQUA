/**
 * 日本株自動運用の条件カタログ（コスト画面・ログの共通番号）
 * /stocks（米国株）とは別。仮想通貨 Soluna と同型の番号付き整理。
 */
import {
  STOCK_HARD_TAKE_PROFIT_MULT,
  STOCK_LOT_SIZE,
  STOCK_MAX_ACTIVE_JP_WATCHES,
  STOCK_MAX_DAILY_BUY_YEN,
  STOCK_MAX_QTY_PER_ORDER,
  STOCK_MAX_SINGLE_ASSET_RATIO,
  STOCK_MAX_TRADE_YEN,
  STOCK_MIN_CASH_RATIO,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PRINCIPAL_YEN,
} from "@/lib/stock-trade-constants";

export type StockTradeRuleCategory =
  | "universe"
  | "risk"
  | "buy"
  | "sell"
  | "mode";

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
    title: "単一銘柄上限",
    summary: `1銘柄の想定時価は余力+保有概算の ${pct(STOCK_MAX_SINGLE_ASSET_RATIO)} まで`,
  },
  {
    id: 7,
    category: "risk",
    title: "ウォッチ数上限",
    summary: `日本株アクティブウォッチは ${STOCK_MAX_ACTIVE_JP_WATCHES} 銘柄までをシミュレーション対象`,
  },
  {
    id: 8,
    category: "buy",
    title: "AI買い + 強気トレンド",
    summary:
      "ウォッチAIが buy かつ短期トレンドが強気のとき買いインテントを生成（条件達成銘柄は互いに除外しない）",
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
    summary: "東証の粗いセッション（9:00–11:30 / 12:30–15:00 JST）を sessionOpenGuess として付与",
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
    summary: `毎月の売り側おおよそ実現益 ${yen(STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN)} を目標（元本 ${yen(STOCK_PRINCIPAL_YEN)} の約 2.5%/月）。達成判定用`,
  },
  {
    id: 21,
    category: "buy",
    title: "月次目標到達後の買い停止",
    summary: `当月の売り益概算が ${yen(STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN)} に達したら新規買いを見送り（売り・利確は継続）`,
  },
  {
    id: 22,
    category: "risk",
    title: "元本対比の過大建玉抑制",
    summary: `1回の買付概算が元本目安 ${yen(STOCK_PRINCIPAL_YEN)} の 70% を超えるインテントは見送り（集中リスク回避）`,
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
