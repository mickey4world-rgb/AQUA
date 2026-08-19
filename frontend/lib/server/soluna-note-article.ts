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
      const lines = block.split("\n").map((line) => {
        const escaped = escapeHtml(line);
        // キャラクターラベル行は太字で強調
        if (CHARACTER_LABELS.some((label) => line.startsWith(label))) {
          return `<strong>${escaped}</strong>`;
        }
        return escaped;
      }).join("<br>");
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
  const resultLabel = input.battle.outcome === "victory" ? "討伐成功 🏆" : "取り逃がし 💨";
  const news = input.battle.newsPlain || input.briefing.summary;
  const item = input.battle.loot.itemName
    ? `${input.battle.loot.itemName}${input.battle.loot.itemFlavor ? `（${input.battle.loot.itemFlavor}）` : ""}`
    : "今回はアイテムなし";
  const medal =
    input.battle.loot.medal === "rainbow" ? "🌈 虹メダル"
    : input.battle.loot.medal === "gold" ? "🥇 金メダル"
    : input.battle.loot.medal === "silver" ? "🥈 銀メダル"
    : input.battle.loot.medal === "bronze" ? "🥉 銅メダル"
    : "メダルなし";
  const todayItems = input.hunter.inventory.filter((row) => row.briefingId === input.briefing.id).length;

  // 全発言を取得し、無料用（冒頭1往復）と有料用（全文）を分割
  const allMessages = input.messages.filter((m) => m.role === "sol" || m.role === "luna");
  const freeMessages = allMessages.slice(0, 2);   // Sol第1発言・Luna第2発言
  const paidMessages = allMessages.slice(2);       // Sol第3・Luna第4（白熱部分）

  const freeDialogue = dialogueLines(freeMessages);
  const paidDialogue = dialogueLines(paidMessages);
  const fullDialogue = dialogueLines(allMessages);

  const creator = process.env.NOTE_CREATOR_URLNAME?.trim();
  const shopLine = creator ? `https://note.com/${creator}` : "このマガジンの有料購読";

  const swaBase = "https://www.aquacore.net";
  const charImageUrl = `${swaBase}/soluna/characters.png`;

  const title = `⚔️ ${input.battle.bossName}を追え｜${dateLabel}｜ソルとルーナの朝討伐`;

  const characterIntro = `${SOL_LABEL} ／ ${LUNA_LABEL}
今日もニュースをモンスターに変えて、2人が討伐に挑みます。
→ キャラクター紹介: ${charImageUrl}`;

  // ── 無料部分：ニュース解説 ＋ 冒頭1往復 ＋ 「続きは有料」の引き ─────────
  const freeBody = `${characterIntro}

## 今日のニュース
${news}
${input.battle.newsTitle ? `\n出典: ${input.battle.newsTitle}` : ""}

今日の相手は ${boss}。ソルとルーナがこのニュースに切り込みます。

## 2人の語り出し

${freeDialogue || "（本日は偵察戦から始まります）"}

---

白熱した議論の続き、バトルの結末（${resultLabel}）、2人の仕事の進捗は有料版で読めます。

${SOL_LABEL}「議論はまだ終わっていない。続きが気になるなら↓へ。」
${LUNA_LABEL}「…答えが出たかどうか、自分の目で確かめてみて。」

→ 続きを読む: ${shopLine}`;

  // ── 有料部分：白熱全文 ＋ バトル結果 ＋ 仕事3つの進捗 ────────────────────
  const paidBody = `有料購読のあなたへ。白熱した続きと、今日の全仕事レポートです。

## 白熱の続き — ここからが本番

${paidDialogue || "（本日は2ターンで決着がつきました）"}

---

## バトル結果：${boss} vs ソル＆ルーナ

結果: ${resultLabel}
${input.battle.outcomeWhy || input.battle.impression}

${input.battle.impression}

## 次に見るべきポイント
${input.battle.nextMove}

## 今日の収穫
・メダル: ${medal}
・アイテム: ${item}
・経験値: +${input.battle.loot.xpGained}
・累計メダル: ${medalReport(input.hunter)}
・ハンターレベル: Lv.${input.hunter.level}

---

## 🌌 仕事① 宇宙分析（BOINC）進捗

今日取得したアイテム ${todayItems} 個を熱量に変換 → 宇宙分析 ${input.boincMinutes} 分分を GitHub Actions で実行。

${SOL_LABEL}「星の計算は、討伐の余熱で回す。アイテムが多い日ほど、宇宙に届く計算量が増える。」
${LUNA_LABEL}「${input.boincMinutes} 分、ちゃんとログを残して。貢献は気分じゃなく積み上げよ。」

## 📈 仕事② 資産運用（bitFlyer BTC）進捗

元手 10万円から開始。メダル ${medalUnitScore(input.hunter.medals)} 単位を今日の投資判断の燃料に。
毎回の取引は最大1万円。月利2%を目標にドルコスト平均法で積み上げる。

${SOL_LABEL}「今日のニュースセンチメントと相場を読んで判断した。結果は明日の残高で語る。」
${LUNA_LABEL}「欲張らないのがルール。目標に届いたらおやすみモードに入る。勝ち逃げが一番かしこい。」

## 📝 仕事③ Note 公開

この記事自体が仕事③。有料購読が回るほど宇宙分析の稼働時間が伸びる仕組み。
ソルとルーナが毎朝自動で書いて、自動で投稿しています。

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
