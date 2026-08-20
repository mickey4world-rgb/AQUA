import type {
  SolunaAssetLedger,
  SolunaBattleResult,
  SolunaBoincRun,
  SolunaHunterState,
  SolunaNewsBriefing,
  SolunaNoteArticle,
  SolunaSettlementState,
  SolunaSystemMessage,
} from "@/lib/types/soluna";
import { medalUnitScore } from "@/lib/server/soluna-battle";
import { formatGuildFinanceRpgReport } from "@/lib/server/soluna-asset-rpg";
import { formatAdventureLogForNote } from "@/lib/server/soluna-journey";
import { formatSettlementDiary } from "@/lib/server/soluna-settlement";

function jstDateLabel(date = new Date()): string {
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SOL_LABEL = "⚔️ ソル（勇者）";
const LUNA_LABEL = "📖 ルーナ（賢者）";
const CHARACTER_LABELS = [SOL_LABEL, LUNA_LABEL];

function toNoteHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith("## ")) {
        return `<h2>${escapeHtml(block.slice(3).trim())}</h2>`;
      }
      const lines = block
        .split("\n")
        .map((line) => {
          const escaped = escapeHtml(line);
          if (CHARACTER_LABELS.some((label) => line.startsWith(label))) {
            return `<strong>${escaped}</strong>`;
          }
          return escaped;
        })
        .join("<br>");
      return `<p>${lines}</p>`;
    })
    .join("");
}

function dialogueLines(messages: SolunaSystemMessage[]): string {
  return messages
    .filter((message) => message.role === "sol" || message.role === "luna")
    .map((message) => {
      const label = message.role === "sol" ? SOL_LABEL : LUNA_LABEL;
      return `${label}\n${message.content.trim()}`;
    })
    .join("\n\n");
}

function medalReport(hunter: SolunaHunterState): string {
  const { medals } = hunter;
  return `銅${medals.bronze}枚 / 銀${medals.silver}枚 / 金${medals.gold}枚 / 虹${medals.rainbow}枚（AI総投資単位 ${medalUnitScore(medals)}）`;
}

export function notePriceYen(): number {
  const raw = Number(process.env.NOTE_PRICE_YEN ?? "100");
  return Number.isFinite(raw) && raw >= 0 ? raw : 100;
}

export function composeDailyNote(input: {
  briefing: SolunaNewsBriefing;
  battle: SolunaBattleResult;
  hunter: SolunaHunterState;
  messages: SolunaSystemMessage[];
  boincMinutes: number;
  assets?: SolunaAssetLedger | null;
  boinc?: SolunaBoincRun | null;
  settlement?: SolunaSettlementState | null;
}): {
  title: string;
  freeBody: string;
  paidBody: string;
  freeHtml: string;
  paidHtml: string;
  priceYen: number;
} {
  const dateLabel = jstDateLabel(new Date(input.battle.createdAt));
  const boss = `Lv.${input.battle.bossRank} ${input.battle.bossName}`;
  const escaped = input.battle.outcome === "escape";
  const resultLabel = escaped ? "取り逃がし 💨" : "討伐成功 🏆";
  const news = input.battle.newsPlain || input.briefing.summary;
  const item = input.battle.loot.itemName
    ? `${input.battle.loot.itemName}${input.battle.loot.itemFlavor ? `（${input.battle.loot.itemFlavor}）` : ""}`
    : "今回はアイテムなし";
  const medal =
    input.battle.loot.medal === "rainbow"
      ? "🌈 虹メダル"
      : input.battle.loot.medal === "gold"
        ? "🥇 金メダル"
        : input.battle.loot.medal === "silver"
          ? "🥈 銀メダル"
          : input.battle.loot.medal === "bronze"
            ? "🥉 銅メダル"
            : "メダルなし";

  const allMessages = input.messages.filter((m) => m.role === "sol" || m.role === "luna");
  // 無料: ソル第1＋ルーナ第2（引き）。有料: 第3・第4（白熱）
  const freeDialogue = dialogueLines(allMessages.slice(0, 2));
  const paidDialogue = dialogueLines(allMessages.slice(2));

  const creator = process.env.NOTE_CREATOR_URLNAME?.trim();
  const shopLine = creator ? `https://note.com/${creator}` : "このマガジンの有料購読";
  const charImageUrl = "https://www.aquacore.net/soluna/characters.png";
  const assets = input.assets ?? null;
  const boincMinutes = input.boinc?.result?.runMinutesActual ?? input.boincMinutes;
  const boincCredit = input.boinc?.result?.creditGranted;

  const title = `⚔️ ${input.battle.bossName}を追え｜${dateLabel}｜ソルとルーナの朝討伐`;

  // 取り逃がし時は「リベンジ価値」を無料エリアで明示
  const escapeHook = escaped
    ? `
## 取り逃がしたからこそ手に入るもの
負けた記事ではありません。${boss}に逃げられたからこそ、有料エリアでは次が読めます。

・リベンジ戦略: 次に同じ系統のモンスターが来たときの弱点（市場の見通し・防衛策）
・逃げ足の鱗: 今日の失敗ログから読み解く、ポートフォリオ防衛の一手
・反省会の白熱: 2人のドタバタ掛け合い（ボケ＆ツッコミ）全文`
    : `
## 討伐成功の先にあるもの
有料エリアでは、激闘の続きと収穫の使い道まで読めます。

・激闘の裏側: 白熱した第2ラウンド全文
・戦利品の使い道: メダル運用と宇宙分析への変換レポート
・次の狩り場: 明日狙うべきニュースの急所`;

  const paywallTeaser = escaped
    ? `${LUNA_LABEL}
でもソル、この ${input.battle.bossName} を放置すると、私たちのサイフ（ポートフォリオ）に直撃する大問題が発生するわよ…！
討伐には失敗したけれど、奴の『逃げ足の鱗』から次の防衛策が見えてきたわ。続きは有料で。`
    : `${LUNA_LABEL}
討伐はできた。でも収穫の使い道と、次に来るモンスターの弱点は、まだ話していないわ。
続きが気になるなら↓へ。`;

  const adventureLog = formatAdventureLogForNote(input.battle);

  const freeBody = `${SOL_LABEL} ／ ${LUNA_LABEL}
今日もニュースをモンスターに変えて、2人が世界を旅しながら討伐に挑みます。
→ キャラクター紹介: ${charImageUrl}
${
  (assets?.lastPromptBattleMode ?? assets?.battleMode) === "attack"
    ? `
【前日からのバフ発動！】
🌟 ギルド特殊効果：『前日ドロップ利益の恩恵（魔力増幅＋20%）』が発動中！
`
    : (assets?.lastPromptBattleMode ?? assets?.battleMode) === "defense" && assets?.status === "done"
      ? `
【防御モード】
🛡️ 昨日は敵の急襲の気配。黄金の守護巨兵で足元を固めてから討伐へ。
`
      : ""
}

${adventureLog}

## 2人の掛け合い（ダイジェスト）

${freeDialogue || "（本日は偵察戦から始まります）"}

${paywallTeaser}

---
✂️ （ここから有料） ✂️
---

【有料エリアの先にあるもの】
・激闘の続き: 小物戦の裏側＆大ボス戦の白熱全文
・${escaped ? "リベンジ戦略" : "収穫レポート"}: ${escaped ? "次の防衛策と市場の見通し" : "メダル・アイテムの使い道"}
・召喚獣育成ステータス: 聖なる魔力タンク（MP）とレベルアップ報告
・拠点都市開拓: 購読パワーが街を育てる「街づくりレポート」

${escapeHook}

→ 続きを読む: ${shopLine}`;

  const guildFinance = formatGuildFinanceRpgReport(assets);
  const settlementDiary = formatSettlementDiary(input.settlement);

  const paidBody = `有料購読のあなたへ。白熱の続きと、今日のギルド全仕事レポートです。

## 2人の掛け合い（有料限定・激闘の裏側）

${paidDialogue || "（本日は2ターンで決着がつきました）"}

${
  escaped
    ? `${SOL_LABEL}
くっそー！${input.battle.bossName} に逃げられちまった！でも次の一手は、もう見えている。

${LUNA_LABEL}
焦らないで。奴が落とした『逃げ足の鱗』を分析すれば、次に同じニュース（モンスター）が来た時の弱点が丸裸になるわ。`
    : `${SOL_LABEL}
今日の討伐は決まった。収穫はギルドの燃料にするぞ！

${LUNA_LABEL}
勝ち逃げも大事。ここで欲張らず、財務報告と拠点開拓に回しましょう。`
}

---

## バトル結果：${boss} vs ソル＆ルーナ（複数戦）

大ボス結果: ${resultLabel}
複数戦成績: ${input.battle.wins ?? "—"}勝${input.battle.losses ?? "—"}敗 / 物語ゴールド +${input.battle.goldFlavorTotal ?? 0}
${input.battle.journey ? `舞台: 『${input.battle.journey.areaName}』→ 次は『${input.battle.journey.nextAreaName}』` : ""}
${input.battle.outcomeWhy || input.battle.impression}

${input.battle.impression}

## ${escaped ? "リベンジ戦略（次に見るべきポイント）" : "次に見るべきポイント"}
${input.battle.nextMove}

## 今日の収穫
・メダル: ${medal}
・アイテム: ${item}
・経験値: +${input.battle.loot.xpGained}
・累計メダル: ${medalReport(input.hunter)}
・ハンターレベル: Lv.${input.hunter.level}

---

${settlementDiary}

${
  input.boinc?.result
    ? `
（裏ログ）解析エンジン実績: ${boincMinutes} 分 / ${boincCredit} cobblestones / ${input.boinc.result.projectName}`
    : `
（裏ログ）解析エンジン: BOINC宇宙分析 ${boincMinutes} 分をキュー投入`
}

---

${guildFinance}

毎日自動で、ここまでをお届けします。明日もまた、ニュースをモンスターに変えて討伐に出かけます。`;

  return {
    title,
    freeBody,
    paidBody,
    freeHtml: toNoteHtml(freeBody),
    paidHtml: toNoteHtml(paidBody),
    priceYen: notePriceYen(),
  };
}

export function createNoteArticleRecord(
  composed: ReturnType<typeof composeDailyNote>,
  briefingId: string,
): SolunaNoteArticle {
  return {
    id: `note-${briefingId}`,
    briefingId,
    createdAt: new Date().toISOString(),
    title: composed.title,
    freeBody: composed.freeBody,
    paidBody: composed.paidBody,
    priceYen: composed.priceYen,
    published: false,
  };
}
