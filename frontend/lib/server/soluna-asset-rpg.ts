/**
 * 資産運用の RPG 風見立て（Note / UI 共通）
 *
 * 元本 10万円 → 聖なる魔力タンク（最大 100,000 MP）
 * BTC → 烈火の竜 / ETH → 蒼穹の不死鳥
 * 実現利益 → 討伐報酬（純金ゴールド）
 * 含み損益・前日比 → 戦況ゲージ（優勢 / 劣勢）
 */
import type { SolunaAssetLedger } from "@/lib/types/soluna";

const PRINCIPAL_MP = 100_000;

export const RPG_BTC_NAME = "🐉 烈火の竜（ビットコイン）";
export const RPG_ETH_NAME = "🦅 蒼穹の不死鳥（イーサリアム）";
export const RPG_MP_TANK = "聖なる魔力タンク";

function signed(n: number): string {
  const rounded = Math.round(n);
  return `${rounded >= 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}`;
}

function battleGaugeLabel(dayChangeYen: number): string {
  if (dayChangeYen > 500) return "優勢 📈（味方のターン）";
  if (dayChangeYen < -500) return "劣勢 📉（敵のターン・ルーナの防御魔法で耐えている）";
  return "膠着 ⚖️（様子見）";
}

/**
 * Note 有料エリア末尾に挿入するギルド財務ステータス画面
 */
export function formatGuildFinanceRpgReport(assets: SolunaAssetLedger | null | undefined): string {
  if (!assets) {
    return `## 📊 本日のソル＆ルーナ・ギルド財務報告

【bitFlyer遠征資産のステータス】
${RPG_MP_TANK}（ギルド資金）: ${PRINCIPAL_MP.toLocaleString("ja-JP")} MP
総魔力: 計測待機中（入金・API接続後に自動更新）

⚔️ ソル「魔力タンクへの充填を待っている。届き次第、烈火の竜を召喚する！」
📖 ルーナ「入金と API が揃えば、毎日ここで戦況を報告するわ。」`;
  }

  const dayChange = assets.totalYen - (assets.previousTotalYen || assets.totalYen);
  const dayChangeLabel =
    dayChange === 0
      ? "前日比: ±0 MP"
      : `前日比: ${signed(dayChange)} MP ${dayChange > 0 ? "📈" : "📉"}`;
  const gauge = battleGaugeLabel(dayChange);
  const gold = Math.round(assets.monthlyRealizedPnlYen);
  const goldTarget = Math.max(1, Math.round(assets.monthlyTargetYen));
  const goldProgress = Math.min(100, Math.round((gold / goldTarget) * 100));
  const unusedMp = Math.round(assets.cashYen);
  const btcMp = Math.round(assets.btcHeld * (assets.btcPriceYen || 0));
  const ethMp = Math.round((assets.ethHeld || 0) * (assets.ethPriceYen || 0));

  const summons: string[] = [];
  if (assets.btcHeld > 0.00005) {
    summons.push(
      `${RPG_BTC_NAME}: ${assets.btcHeld.toFixed(4)} BTC（魔力 ${btcMp.toLocaleString("ja-JP")} MP を消費して召喚中・主戦力）`,
    );
  }
  if ((assets.ethHeld || 0) > 0.0005) {
    summons.push(
      `${RPG_ETH_NAME}: ${assets.ethHeld.toFixed(4)} ETH（魔力 ${ethMp.toLocaleString("ja-JP")} MP・ルーナの魔力回復枠）`,
    );
  }
  if (summons.length === 0) {
    summons.push("召喚獣なし — 未使用魔力を温存中（ドルコスト平均法で次の召喚を待つ）");
  }

  const sleepLine = assets.sleepMode
    ? "🌙 月次目標達成！おやすみモード（新規召喚停止・防衛専念）"
    : `討伐報酬の進捗: ${goldProgress}%（目標 ${goldTarget.toLocaleString("ja-JP")} ゴールド）`;

  return `## 📊 本日のソル＆ルーナ・ギルド財務報告

【bitFlyer遠征資産のステータス】

総魔力（現在の評価額）: ${Math.round(assets.totalYen).toLocaleString("ja-JP")} MP（${dayChangeLabel}）
ギルド資金・${RPG_MP_TANK}（元本）: ${Math.round(assets.principalYen).toLocaleString("ja-JP")} MP
未召喚の魔力（現金）: ${unusedMp.toLocaleString("ja-JP")} MP
今月の討伐報酬（獲得利益）: 🎉 ${gold.toLocaleString("ja-JP")} ゴールド（今月の目標：${goldTarget.toLocaleString("ja-JP")} ゴールド）
戦況ゲージ（含みの気配）: ${gauge}
${sleepLine}

【現在の召喚獣（保有暗号資産）】

${summons.map((line) => `・${line}`).join("\n")}

⚔️ ソル「${assets.solComment}」
📖 ルーナの賢者投資メモ:
「${assets.lunaComment}」`;
}
