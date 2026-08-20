import type {
  SolunaAssetLedger,
  SolunaBattleResult,
  SolunaBoincRun,
  SolunaHunterState,
  SolunaNewsBriefing,
  SolunaNoteArticle,
  SolunaSystemMessage,
} from "@/lib/types/soluna";
import { medalUnitScore } from "@/lib/server/soluna-battle";

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

function latestTradeLine(assets: SolunaAssetLedger | null | undefined): string {
  if (!assets) return "入金待ち / API 接続準備中。";
  const latest = assets.trades[assets.trades.length - 1];
  if (!latest) {
    return assets.status === "waiting-spec"
      ? "メダルなしのため現状維持（取引待機）。"
      : "本日は取引なし（現状維持）。";
  }
  const pnl =
    latest.realizedPnlJpy !== undefined
      ? ` / 損益 ${latest.realizedPnlJpy >= 0 ? "+" : ""}${latest.realizedPnlJpy.toLocaleString("ja-JP")}円`
      : "";
  return `${latest.side} ${latest.sizeJpy.toLocaleString("ja-JP")}円 @ ${latest.priceBtc.toLocaleString("ja-JP")}円${pnl}`;
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
  const medalUnits = medalUnitScore(input.hunter.medals);

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

  const freeBody = `${SOL_LABEL} ／ ${LUNA_LABEL}
今日もニュースをモンスターに変えて、2人が討伐に挑みます。
→ キャラクター紹介: ${charImageUrl}

## 今日のニュース
${news}
${input.battle.newsTitle ? `\n出典: ${input.battle.newsTitle}` : ""}

相手は ${boss}。結果は【${resultLabel}】です。

## 2人の掛け合い（ダイジェスト）

${freeDialogue || "（本日は偵察戦から始まります）"}

${paywallTeaser}

---
✂️ （ここから有料） ✂️
---

【有料エリアの先にあるもの】
・激闘の続き: 2人のドタバタ反省会 / 白熱バトル全文
・${escaped ? "リベンジ戦略" : "収穫レポート"}: ${escaped ? "次の防衛策と市場の見通し" : "メダル・アイテムの使い道"}
・ギルド財務報告: 所持メダルと資産運用の現在地
・社会貢献: 購読の熱量が宇宙分析（BOINC）に変わるレポート

${escapeHook}

→ 続きを読む: ${shopLine}`;

  const portfolioBlock = assets
    ? `総資産 ${assets.totalYen.toLocaleString("ja-JP")} 円 / 現金 ${assets.cashYen.toLocaleString("ja-JP")} 円 / BTC ${assets.btcHeld.toFixed(4)}
月次目標 ${assets.monthlyTargetYen.toLocaleString("ja-JP")} 円に対し、実現損益 ${assets.monthlyRealizedPnlYen.toLocaleString("ja-JP")} 円${assets.sleepMode ? "（🌙 おやすみモード）" : ""}
今回の運用アクション: ${latestTradeLine(assets)}`
    : `元手 10万円スタート。メダル ${medalUnits} 単位を今日の投資判断の燃料に。
今回の運用アクション: ${latestTradeLine(null)}`;

  const boincBlock = input.boinc?.result
    ? `本日の提供熱量: BOINC分析時間 ${boincMinutes} 分
クレジット: ${boincCredit} cobblestones（${input.boinc.result.projectName}）
タスク完了: ${input.boinc.result.tasksCompleted} 件`
    : `本日の提供熱量: BOINC分析時間 ${boincMinutes} 分（実行キュー投入）
有料購読の輪が回るほど、宇宙分析の稼働時間が伸びます。`;

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
勝ち逃げも大事。ここで欲張らず、財務報告と宇宙分析に回しましょう。`
}

---

## バトル結果：${boss} vs ソル＆ルーナ

結果: ${resultLabel}
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

## 📊 ソル＆ルーナ・ギルド財務報告

${portfolioBlock}
現在の所持メダル: ${medalReport(input.hunter)}

${SOL_LABEL}「${assets?.solComment ?? "今日のニュースと相場を読んで判断する。"}」
${LUNA_LABEL}「${assets?.lunaComment ?? "欲張らないのがルール。目標に届いたらおやすみモードよ。"}」

## 🌍 本日の社会貢献（BOINC宇宙分析レポート）

${boincBlock}

${SOL_LABEL}「みんなの応援（購読）が、僕たちの戦う力と宇宙を解き明かすエネルギーになるんだ。」
${LUNA_LABEL}「${boincMinutes} 分、ちゃんとログを残して。貢献は気分じゃなく積み上げよ。」

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
