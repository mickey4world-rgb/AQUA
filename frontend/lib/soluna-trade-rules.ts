/**
 * Soluna 自動売買の条件カタログ（コスト画面・取引明細の共通番号）
 * 番号は表示・理由参照用。エンジン側の定数と意味を揃えること。
 */
import {
  HARD_STOP_LOSS_RATE,
  HARD_TAKE_PROFIT_RATE,
  LONG_TERM_RECOVERY_HORIZON_MS,
  MAX_CRYPTO_RATIO,
  MAX_DAILY_BUY_YEN,
  MAX_SINGLE_ASSET_RATIO,
  MAX_SPREAD_BPS,
  MAX_TRADE_YEN,
  MIN_CASH_RATIO,
  NO_STOP_LOSS_BELOW_CASH_YEN,
  SLEEP_MODE_RATE,
  SOFT_STOP_LOSS_RATE,
  SOFT_TAKE_PROFIT_RATE,
  TRADEABLE_PRODUCTS,
} from "@/lib/soluna-asset-trade-constants";

export type SolunaTradeRuleCategory =
  | "universe"
  | "risk"
  | "buy"
  | "sell"
  | "mode";

export interface SolunaTradeRule {
  id: number;
  category: SolunaTradeRuleCategory;
  title: string;
  summary: string;
}

const pct = (rate: number) => `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;
const holdYears = Math.round(LONG_TERM_RECOVERY_HORIZON_MS / (365 * 24 * 60 * 60 * 1000));

export const SOLUNA_TRADE_RULES: SolunaTradeRule[] = [
  {
    id: 1,
    category: "universe",
    title: "対象銘柄",
    summary: `${TRADEABLE_PRODUCTS.map((p) => p.replace("_JPY", "")).join(" / ")} の Spot のみ自動売買`,
  },
  {
    id: 2,
    category: "risk",
    title: "1回の買付上限",
    summary: `1約定あたり最大 ${yen(MAX_TRADE_YEN)}（確信度でサイズ可変）`,
  },
  {
    id: 3,
    category: "risk",
    title: "日次買付上限",
    summary: `JST 1日あたり買付合計 ${yen(MAX_DAILY_BUY_YEN)} まで`,
  },
  {
    id: 4,
    category: "risk",
    title: "買付冷却",
    summary: "直前の買いから約2時間は新規買いしない（利確監視は継続）",
  },
  {
    id: 5,
    category: "risk",
    title: "現金下限",
    summary: `総資産の ${pct(MIN_CASH_RATIO)} を現金として維持`,
  },
  {
    id: 6,
    category: "risk",
    title: "単一銘柄上限",
    summary: `1銘柄の時価は総資産の ${pct(MAX_SINGLE_ASSET_RATIO)} まで`,
  },
  {
    id: 7,
    category: "risk",
    title: "暗号合計上限",
    summary: `暗号資産合計の時価は総資産の ${pct(MAX_CRYPTO_RATIO)} まで`,
  },
  {
    id: 8,
    category: "buy",
    title: "強気スコアで買い",
    summary: "板・約定・多期間トレンドのスコアが閾値以上、かつ強気バイアスの銘柄を買う（防御/ニュースで閾値調整）",
  },
  {
    id: 9,
    category: "buy",
    title: "スプレッド上限",
    summary: `買気配と売気配の乖離が ${MAX_SPREAD_BPS}bps 超なら見送り`,
  },
  {
    id: 10,
    category: "buy",
    title: "中長期トレンド確認",
    summary: "中長期が大きく下落しているときは買いを見送り、または閾値を厳しくする",
  },
  {
    id: 11,
    category: "sell",
    title: "硬利確",
    summary: `平均取得単価比 ${pct(HARD_TAKE_PROFIT_RATE)} 以上で売却`,
  },
  {
    id: 12,
    category: "sell",
    title: "ソフト利確",
    summary: `平均取得単価比 ${pct(SOFT_TAKE_PROFIT_RATE)} 以上かつ勢い減衰・弱気化で売却`,
  },
  {
    id: 13,
    category: "sell",
    title: "損切り禁止（現金薄い）",
    summary: `現金 ${yen(NO_STOP_LOSS_BELOW_CASH_YEN)} 以下では損切りしない（プラス転換まで保有）`,
  },
  {
    id: 14,
    category: "sell",
    title: "損切り禁止（長期保有）",
    summary: `初回買いから約${holdYears}年未満は損切りしない（回復余地を優先）`,
  },
  {
    id: 15,
    category: "sell",
    title: "硬損切り（例外）",
    summary: `約${holdYears}年超保有かつ現金に余裕があり、含み損 ${pct(HARD_STOP_LOSS_RATE)} 以下のとき例外的に売却`,
  },
  {
    id: 16,
    category: "sell",
    title: "ソフト損切り（例外）",
    summary: `約${holdYears}年超・含み損 ${pct(SOFT_STOP_LOSS_RATE)} 以下・下落継続が揃ったとき例外的に売却`,
  },
  {
    id: 17,
    category: "mode",
    title: "おやすみモード",
    summary: `当月実現損益が月初残高の ${pct(SLEEP_MODE_RATE)} 超で新規買い停止（利確は継続）`,
  },
  {
    id: 18,
    category: "mode",
    title: "月次目標",
    summary: "月初残高×2%を目安（下限2,000円）。目標達成の判定用で、単独の売買トリガーではない",
  },
];

export function tradeRuleById(id: number): SolunaTradeRule | undefined {
  return SOLUNA_TRADE_RULES.find((r) => r.id === id);
}

/** 取引理由表示用: 「#11+#12 · 硬利確」 */
export function formatTradeReasonWithRules(
  reason: string,
  ruleIds?: number[] | null,
): string {
  const ids =
    ruleIds && ruleIds.length > 0
      ? [...new Set(ruleIds)].sort((a, b) => a - b)
      : inferRuleIdsFromLegacyReason(reason);
  const idLabel = ids.length > 0 ? ids.map((id) => `#${id}`).join("+") : null;
  const kind = legacyReasonKindJa(reason);
  if (idLabel && kind) return `${idLabel} · ${kind}`;
  if (idLabel) return idLabel;
  return kind || reason || "—";
}

function legacyReasonKindJa(reason: string): string {
  if (reason === "dca" || reason.includes("dca") || reason.includes("召喚")) return "買い（分散召喚）";
  if (reason === "take-profit" || reason.includes("利確")) return "利確";
  if (reason === "stop-loss" || reason.includes("損切")) return "損切り";
  return "";
}

/** 旧台帳（ruleIds なし）向けの粗い推定 */
export function inferRuleIdsFromLegacyReason(reason: string): number[] {
  if (/#\d+/.test(reason)) {
    return [...reason.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((n) => n > 0);
  }
  if (reason === "dca" || reason.includes("dca") || reason.includes("召喚")) {
    return [1, 2, 6, 7, 8];
  }
  if (reason.includes("硬利確")) return [11];
  if (reason.includes("勢い減衰")) return [12];
  if (reason === "take-profit" || reason.includes("利確")) return [11];
  if (reason.includes("硬損切") || reason.includes("1年超保有後の硬")) return [15];
  if (reason.includes("下落継続")) return [16];
  if (reason === "stop-loss" || reason.includes("損切")) return [15];
  return [];
}

export function categoryLabelJa(category: SolunaTradeRuleCategory): string {
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
