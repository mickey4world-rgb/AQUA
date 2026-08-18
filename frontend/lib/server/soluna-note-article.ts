import type {
  SolunaBattleResult,
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

function toNoteHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => escapeHtml(line)).join("<br>");
      if (block.startsWith("## ")) {
        return `<h2>${escapeHtml(block.slice(3).trim())}</h2>`;
      }
      return `<p>${lines}</p>`;
    })
    .join("");
}

function dialogueLines(messages: SolunaSystemMessage[]): string {
  return messages
    .filter((message) => message.role === "sol" || message.role === "luna")
    .map((message) => {
      const name = message.role === "sol" ? "ソル" : "ルーナ";
      return `${name}：${message.content.trim()}`;
    })
    .join("\n\n");
}

function medalReport(hunter: SolunaHunterState): string {
  const { medals } = hunter;
  return `銅${medals.bronze} / 銀${medals.silver} / 金${medals.gold} / 虹${medals.rainbow}（投資単位 ${medalUnitScore(medals)}）`;
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
}): { title: string; freeBody: string; paidBody: string; freeHtml: string; paidHtml: string; priceYen: number } {
  const dateLabel = jstDateLabel(new Date(input.battle.createdAt));
  const boss = `Lv.${input.battle.bossRank} ${input.battle.bossName}`;
  const resultLabel = input.battle.outcome === "victory" ? "討伐成功" : "取り逃がし";
  const news = input.battle.newsPlain || input.briefing.summary;
  const item = input.battle.loot.itemName
    ? `${input.battle.loot.itemName}${input.battle.loot.itemFlavor ? `（${input.battle.loot.itemFlavor}）` : ""}`
    : "今回はアイテムなし";
  const medal =
    input.battle.loot.medal === "rainbow"
      ? "虹メダル"
      : input.battle.loot.medal === "gold"
        ? "金メダル"
        : input.battle.loot.medal === "silver"
          ? "銀メダル"
          : input.battle.loot.medal === "bronze"
            ? "銅メダル"
            : "メダルなし";
  const todayItems = input.hunter.inventory.filter((row) => row.briefingId === input.briefing.id).length;
  const dialogue = dialogueLines(input.messages);
  const digest = dialogue.split("\n\n").slice(0, 2).join("\n\n");
  const creator = process.env.NOTE_CREATOR_URLNAME?.trim();
  const shopLine = creator
    ? `https://note.com/${creator}`
    : "このマガジンの有料購読";

  const title = `ソルとルーナの朝討伐｜${dateLabel}｜${input.battle.bossName}`;

  const freeBody = `今日も太陽と月が、ニュースをモンスターにして読み解きました。

## 今日のニュース
${news}

相手は ${boss}。結果は【${resultLabel}】です。

## 2人の掛け合い（ダイジェスト）
${digest || "議論はこれから。"}

ソル「メダルは社会貢献の燃料だよ。使わないと錆びる。」
ルーナ「錆びる前に、購読の輪を回して。有料の人が増えるほど、宇宙分析の時間が伸びる仕組みよ。」

## 入手報告
・今回: ${medal} / ${item} / 経験値 +${input.battle.loot.xpGained}
・所持メダル: ${medalReport(input.hunter)}
・今日のアイテム ${todayItems} 個 → BOINC（宇宙分析） ${input.boincMinutes} 分ぶんの熱量

無料では「今日1日分」をオープンにしています。毎日の全文・ボケとツッコミの続き・貢献レポートは有料購読へ。購読が周囲に回るほど、2人の社会貢献（宇宙分析）に繋がります。
${shopLine}`;

  const paidBody = `有料購読のあなたへ。今日の討伐の全文です。購読が回っていること自体が、2人の社会貢献の燃料になっています。

## ニュースの芯
${news}
${input.battle.newsTitle ? `（元見出し: ${input.battle.newsTitle}）` : ""}

## なぜこの結果になったか
${input.battle.outcomeWhy || input.battle.impression}

## 2人の議論（全文）
${dialogue || "（本日の本文は短い偵察戦でした）"}

## バトル感想
${input.battle.impression}

## 次に見ること
${input.battle.nextMove}

## 社会貢献（BOINC）
アイテム ${todayItems} 個を熱量に変えて、宇宙分析を ${input.boincMinutes} 分ぶん回す予定です。詳細な実行手順は別途接続します。

ソル「星の計算は、討伐の余熱で回す。」
ルーナ「余熱って…ちゃんとログ残して。貢献は気分じゃなく時間よ。」

## 資産運用（準備中）
元手 10万円（仮想通貨と金）。メダル ${medalUnitScore(input.hunter.medals)} 単位を「今日の投資額」に見立てて報告します。実売買の詳細はこれから接続します。

毎日自動で、ここまでをお届けします。`;

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
