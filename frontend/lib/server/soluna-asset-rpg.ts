/**
 * 資産運用の RPG 風見立て（Note / バトルプロンプト / UI 共通）
 *
 * 元本 → 聖なる魔力タンク（MP）
 * BTC → 雷轟の蒼竜（ライトニング・バハムート）
 * 現金防衛枠 → 黄金の守護巨兵（ゴールデン・ゴーレム）
 * ETH → 蒼穹の不死鳥
 * 実現利益 → 討伐報酬ゴールド（召喚獣のエサ＝魔力結晶）
 * 前日比プラス → 攻撃バフ / マイナス → 防御モード
 * 1万円評価 ＝ Lv.1
 */
import type { SolunaAssetLedger, SolunaBattleMode } from "@/lib/types/soluna";

const PRINCIPAL_MP = 100_000;
/** 評価額 10,000 MP ＝ Lv.1 */
export const MP_PER_LEVEL = 10_000;

export const RPG_BTC_NAME = "🐉 雷轟の蒼竜（ライトニング・バハムート）";
export const RPG_GOLEM_NAME = "🤖 黄金の守護巨兵（ゴールデン・ゴーレム）";
export const RPG_ETH_NAME = "🦅 蒼穹の不死鳥（イーサリアム）";
export const RPG_MP_TANK = "聖なる魔力タンク";

export function mpToLevel(mp: number): number {
  return Math.round((Math.max(0, mp) / MP_PER_LEVEL) * 10) / 10;
}

export function signed(n: number): string {
  const rounded = Math.round(n);
  return `${rounded >= 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}`;
}

export function resolveBattleMode(dayChangeYen: number): SolunaBattleMode {
  return dayChangeYen > 0 ? "attack" : "defense";
}

export function btcSkillName(level: number): string {
  if (level >= 6) return "半減期ライトニングΩ";
  if (level >= 4) return "半減期ライトニング";
  if (level >= 2) return "蒼炎ブレス";
  return "火花スパーク";
}

export function golemSkillName(level: number): string {
  if (level >= 6) return "金剛の絶対盾";
  if (level >= 4) return "金剛の盾";
  if (level >= 2) return "黄金の防壁";
  return "硬質ガード";
}

export function valuationMp(amount: number, priceYen: number): number {
  return Math.round(amount * (priceYen || 0));
}

export type GuildRpgSnapshot = {
  dayChangeYen: number;
  battleMode: SolunaBattleMode;
  btcMp: number;
  golemMp: number;
  ethMp: number;
  btcLevel: number;
  golemLevel: number;
  ethLevel: number;
  btcLevelDelta: number;
  golemLevelDelta: number;
  buffActive: boolean;
  heavyDamage: boolean;
};

export function buildGuildRpgSnapshot(assets: SolunaAssetLedger): GuildRpgSnapshot {
  const dayChangeYen = Math.round(assets.totalYen - (assets.previousTotalYen || assets.totalYen));
  const battleMode = assets.battleMode ?? resolveBattleMode(dayChangeYen);
  const btcMp = valuationMp(assets.btcHeld, assets.btcPriceYen);
  const golemMp = Math.round(assets.cashYen);
  const ethMp = valuationMp(assets.ethHeld || 0, assets.ethPriceYen || 0);
  const prevBtcMp = assets.previousBtcValueYen ?? btcMp;
  const prevGolemMp = assets.previousCashYen ?? golemMp;
  const btcLevel = mpToLevel(btcMp);
  const golemLevel = mpToLevel(golemMp);
  const ethLevel = mpToLevel(ethMp);
  return {
    dayChangeYen,
    battleMode,
    btcMp,
    golemMp,
    ethMp,
    btcLevel,
    golemLevel,
    ethLevel,
    btcLevelDelta: Math.round((btcLevel - mpToLevel(prevBtcMp)) * 10) / 10,
    golemLevelDelta: Math.round((golemLevel - mpToLevel(prevGolemMp)) * 10) / 10,
    buffActive: battleMode === "attack",
    heavyDamage: dayChangeYen <= -5_000,
  };
}

/**
 * システム会話（ニュースバトル）に渡すバフ／防御条件
 */
export function formatBattleModePromptAddon(assets: SolunaAssetLedger | null): string {
  if (!assets) {
    return `【ギルド遠征ステータス】まだ魔力タンクの計測前。通常の討伐トーンで。`;
  }
  const snap = buildGuildRpgSnapshot(assets);
  if (snap.buffActive) {
    return `【ギルド特殊効果：前日ドロップ利益の恩恵（魔力増幅＋20%）発動中！】
状態: 召喚獣バフモード（攻撃的セリフを多めに）
- ${RPG_BTC_NAME} が青い炎をまとって戦闘モード
- 「昨日稼いだゴールド（利益）」「チャージされた魔力」「一撃で丸焼き」など、前日利益＝バフをセリフに必ず1回入れる
- 強気・大技・押し切りのトーン。ただし事実捏造は禁止`;
  }
  return `【ギルド戦況：防御モード】
状態: 昨日は敵の急襲（下落／利益なし）で魔力を削られた可能性あり
- 無理攻めせず、じっくり敵を見るターン
- ${RPG_GOLEM_NAME} の足元固め・「金剛の盾」・反撃チャンス待ちをセリフに入れる
- 慎重・守り・静観のトーン。事実捏造は禁止`;
}

function levelUpLine(name: string, delta: number, fedGold: boolean): string {
  if (delta <= 0) return "";
  const feed = fedGold
    ? "昨日獲得したゴールドをエサ（魔力結晶）として与え、"
    : "魔力を注ぎ込み、";
  return `${feed}レベルが ${delta.toFixed(1)} 上がった！`;
}

/**
 * Note 有料エリア末尾のギルド財務＆育成ステータス
 */
export function formatGuildFinanceRpgReport(assets: SolunaAssetLedger | null | undefined): string {
  if (!assets) {
    return `## 📊 召喚獣の育成ステータス（現在のポートフォリオ）

${RPG_MP_TANK}: ${PRINCIPAL_MP.toLocaleString("ja-JP")} MP
総魔力: 計測待機中（入金・API接続後に自動更新）

⚔️ ソル「魔力タンクへの充填を待っている。届き次第、${RPG_BTC_NAME} を召喚する！」
📖 ルーナ「入金と API が揃えば、目標達成まで裏で常時育成するわ。」`;
  }

  const snap = buildGuildRpgSnapshot(assets);
  const dayChangeLabel =
    snap.dayChangeYen === 0
      ? "前日比: ±0 MP"
      : `前日比: ${signed(snap.dayChangeYen)} MP ${snap.dayChangeYen > 0 ? "📈" : "📉"}`;
  const gold = Math.round(assets.monthlyRealizedPnlYen);
  const goldTarget = Math.max(1, Math.round(assets.monthlyTargetYen));
  const fedGold = gold > 0 && (snap.btcLevelDelta > 0 || assets.trades.some((t) => t.side === "BUY"));

  const buffBanner = snap.buffActive
    ? `【前日からのバフ発動！】
🌟 ギルド特殊効果：『前日ドロップ利益の恩恵（魔力増幅＋20%）』が発動中！
`
    : snap.heavyDamage
      ? `【大ダメージ検知】
💔 敵の急襲で魔力が大きく削られた（${signed(snap.dayChangeYen)} MP）。復活イベントの準備モード。
`
      : `【防御モード】
🛡️ 昨日は利益なし／劣勢。${RPG_GOLEM_NAME} で足元を固め、反撃のチャンスを待つ。
`;

  const btcBlock =
    assets.btcHeld > 0.00005
      ? `${RPG_BTC_NAME}: Lv. ${snap.btcLevel.toFixed(1)} （現在の戦力: ${snap.btcMp.toLocaleString("ja-JP")} MP）
所持: ${assets.btcHeld.toFixed(4)} BTC / 習得技『${btcSkillName(snap.btcLevel)}』
${levelUpLine(RPG_BTC_NAME, snap.btcLevelDelta, fedGold) || "育成待機中。一撃の破壊力を温存。"}`
      : `${RPG_BTC_NAME}: 未召喚（次の買い増しでレベルアップ開始）`;

  const golemBlock = `${RPG_GOLEM_NAME}: Lv. ${snap.golemLevel.toFixed(1)} （現在の防衛力: ${snap.golemMp.toLocaleString("ja-JP")} MP）
現金防衛枠 ${snap.golemMp.toLocaleString("ja-JP")} 円相当 / 習得技『${golemSkillName(snap.golemLevel)}』
${
  snap.golemLevelDelta > 0
    ? `じわじわと体躯が巨大化（Lv +${snap.golemLevelDelta.toFixed(1)}）。インフレの魔障波をシャットアウトする頼れる巨兵！`
    : snap.golemLevelDelta < 0
      ? `魔力を蒼竜の召喚に回し、巨兵の体躯が少し縮んだ（Lv ${snap.golemLevelDelta.toFixed(1)}）。リバランスの呪文の結果よ。`
      : "足元を固めて待機中。"
}`;

  const ethBlock =
    (assets.ethHeld || 0) > 0.0005
      ? `\n${RPG_ETH_NAME}: Lv. ${snap.ethLevel.toFixed(1)} （戦力: ${snap.ethMp.toLocaleString("ja-JP")} MP）
所持: ${assets.ethHeld.toFixed(4)} ETH`
      : `\n${RPG_ETH_NAME}: 未召喚（分散枠が空けば召喚候補）`;

  const zpgHeld = assets.zpgHeld ?? 0;
  const zpgBlock =
    zpgHeld > 0
      ? `\n🏅 ジパングの黄金札（ZPG）: ${zpgHeld.toFixed(4)} 枚（自動売買API非対応・残高監視）`
      : `\n🏅 ジパング防衛枠: 現金袖として総魔力の約12%を温存（ZPG は Lightning 自動売買不可）`;

  const sleepLine = assets.sleepMode
    ? "🌙 月次利益が10%を超えたためおやすみモード（新規召喚停止・防衛専念）"
    : `討伐報酬ゴールド: ${gold.toLocaleString("ja-JP")} / 目標(2%) ${goldTarget.toLocaleString("ja-JP")}（おやすみは10%超）`;

  return `${buffBanner}
## 📊 召喚獣の育成ステータス（現在のポートフォリオ）

現在のギルド総資産：${Math.round(assets.totalYen).toLocaleString("ja-JP")} MP（${dayChangeLabel}）
${RPG_MP_TANK}（元本）: ${Math.round(assets.principalYen).toLocaleString("ja-JP")} MP
分散ルール: 現金下限28% / 単一銘柄上限42% / 暗号合計上限72%
${sleepLine}

${btcBlock}

${golemBlock}${ethBlock}${zpgBlock}

⚔️ ソル「${assets.solComment}」
📖 ルーナの賢者投資メモ:
「${assets.lunaComment}」`;
}
