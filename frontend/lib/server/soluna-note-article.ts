import { randomUUID } from "crypto";
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

/** Note 設定・世界観の案内ページ（無料リード冒頭） */
export const NOTE_SETTINGS_GUIDE_URL =
  "https://note.com/aqua_studio/n/nf8c11722537c";

/** 既定ハッシュタグ（SWA の NOTE_HASHTAGS で上書き可。カンマ区切り） */
export const DEFAULT_NOTE_HASHTAGS = [
  "ソルとルーナ",
  "AIニュース",
  "ニュース解説",
  "朝活",
];

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

/** note CDN 配下のみ本文画像として許可（外部直リンクは公開時に拒否される） */
function isNoteHostedImageUrl(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return host === "assets.st-note.com" || host.endsWith(".st-note.com");
  } catch {
    return false;
  }
}

function noteBlock(tag: "p" | "h2" | "ul", inner: string): { html: string; id: string } {
  const id = randomUUID();
  return { id, html: `<${tag} name="${id}" id="${id}">${inner}</${tag}>` };
}

export type NoteHtmlParts = {
  html: string;
  /** free_body 末尾ブロック id（有料境界 separator に使う） */
  lastBlockId: string | null;
  imageKeys: string[];
};

/**
 * Note エディタ互換 HTML。
 * - 各ブロックに UUID (name/id)
 * - 外部ドメインの img は落とす（公開 422「利用できない内容」の主因）
 */
export function toNoteHtml(text: string): NoteHtmlParts {
  const imageKeys: string[] = [];
  let lastBlockId: string | null = null;
  const chunks: string[] = [];

  const push = (part: { html: string; id: string }) => {
    chunks.push(part.html);
    lastBlockId = part.id;
  };

  for (const block of text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    const first = lines[0]?.trim() ?? "";

    if (first.startsWith("## ")) {
      push(noteBlock("h2", escapeHtml(first.slice(3).trim())));
      const rest = lines.slice(1).join("\n").trim();
      if (rest) {
        const nested = toNoteHtml(rest);
        chunks.push(nested.html);
        imageKeys.push(...nested.imageKeys);
        if (nested.lastBlockId) lastBlockId = nested.lastBlockId;
      }
      continue;
    }

    const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(first);
    if (imageMatch && lines.filter(Boolean).length === 1) {
      const alt = escapeHtml(imageMatch[1] || "image");
      const src = imageMatch[2].trim();
      if (!isNoteHostedImageUrl(src)) {
        // aquacore 等の外部 URL は公開拒否されるためスキップ（見出し画像は eyecatch で別途）
        continue;
      }
      const safeSrc = escapeHtml(src);
      push(noteBlock("p", `<img src="${safeSrc}" alt="${alt}">`));
      const keyMatch = /\/([a-f0-9-]{8,})\./i.exec(src) ?? /images\/([^/?#]+)/i.exec(src);
      if (keyMatch?.[1]) imageKeys.push(keyMatch[1]);
      continue;
    }

    const nonEmpty = lines.filter((line) => line.trim());
    const bulletLines = nonEmpty.filter((line) => /^[・\-*]\s+/.test(line.trim()));
    if (bulletLines.length >= 2 && bulletLines.length === nonEmpty.length) {
      const items = bulletLines
        .map((line) => {
          const body = line.trim().replace(/^[・\-*]\s+/, "");
          return `<li>${escapeHtml(body)}</li>`;
        })
        .join("");
      push(noteBlock("ul", items));
      continue;
    }

    const htmlLines = lines
      .map((line) => {
        const trimmed = line.trim();
        if (/^[・\-*]\s+/.test(trimmed)) {
          return `・${escapeHtml(trimmed.replace(/^[・\-*]\s+/, ""))}`;
        }
        const escaped = escapeHtml(line);
        if (CHARACTER_LABELS.some((label) => line.startsWith(label))) {
          return `<strong>${escaped}</strong>`;
        }
        // URL は英数字・記号のみ。全角括弧や日本語まで href に食い込まない
        return escaped.replace(
          /(https?:\/\/[\w\-./?#&=%+:@~,;!*'()[\]]+)/gi,
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
        );
      })
      .join("<br>");
    push(noteBlock("p", htmlLines));
  }

  return { html: chunks.join(""), lastBlockId, imageKeys };
}

export function noteHashtags(): string[] {
  const raw = process.env.NOTE_HASHTAGS?.trim();
  const source = raw
    ? raw.split(/[,、]+/).map((t) => t.trim())
    : DEFAULT_NOTE_HASHTAGS;
  return source
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** note の body_length は HTML タグ除去後の可視文字数 */
export function noteVisibleLength(...htmlParts: string[]): number {
  return htmlParts
    .join("")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .length;
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

function harvestReflection(input: {
  battle: SolunaBattleResult;
  escaped: boolean;
}): string {
  const impression = (input.battle.impression || input.battle.outcomeWhy || "").trim();
  const next = (input.battle.nextMove || "").trim();
  return `## 今日の感想
${impression || "今日のニュースも、討伐を通じて立体的に見えてきた。"}

${SOL_LABEL}
${
  input.escaped
    ? "取り逃がしたのは悔しい。でも『逃げ足の鱗』があるなら、次はもっと上手く読めるはずだ！"
    : "今日の収穫はちゃんとギルドの燃料にするぞ。ニュースが少し身近に感じられた！"
}

${LUNA_LABEL}
${
  next
    ? `感想としては、${next}`
    : "たとえは味付け。大事なのはニュース自体が楽しく理解できること。そういう見方もあるね、で終われるのが理想よ。"
}`;
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
  freeLastBlockId: string | null;
  imageKeys: string[];
  hashtags: string[];
  priceYen: number;
} {
  const dateLabel = jstDateLabel(new Date(input.battle.createdAt));
  const boss = `Lv.${input.battle.bossRank} ${input.battle.bossName}`;
  const escaped = input.battle.outcome === "escape";
  const resultLabel = escaped ? "取り逃がし 💨" : "討伐成功 🏆";
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
  const freeDialogue = dialogueLines(allMessages.slice(0, 2));
  const paidDialogue = dialogueLines(allMessages.slice(2));

  const creator = process.env.NOTE_CREATOR_URLNAME?.trim();
  const shopLine = creator ? `https://note.com/${creator}` : "このマガジンの有料購読";
  const assets = input.assets ?? null;
  const boincMinutes = input.boinc?.result?.runMinutesActual ?? input.boincMinutes;
  const boincCredit = input.boinc?.result?.creditGranted;

  const title = `⚔️ ${input.battle.bossName}を追え｜${dateLabel}｜ソルとルーナの朝討伐`;

  const disclaimer = `※このnoteはAIがニュースを討伐するゲームです。初めての方は設定ページをご覧ください。
設定ページ: ${NOTE_SETTINGS_GUIDE_URL}`;

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
でもソル、この ${input.battle.bossName} を放置すると、私たちのサイフ（ポートフォリオ）にも影響が出るかもしれないわ。
討伐には失敗したけれど、奴の『逃げ足の鱗』から次の防衛策が見えてきた。続きは有料で。`
    : `${LUNA_LABEL}
討伐はできた。でも収穫の使い道と、次に来るモンスターの弱点は、まだ話していないわ。
続きが気になるなら↓へ。`;

  const adventureLog = formatAdventureLogForNote(input.battle);

  // キャラ画像は見出し（eyecatch）のみ。本文へ aquacore 直リンクを置くと
  // note 公開時に「本文に利用できない内容が含まれています」で拒否される。
  const freeBody = `${disclaimer}

${SOL_LABEL} ／ ${LUNA_LABEL}
今日もニュースをモンスターに変えて、2人が世界を旅しながら討伐に挑みます。
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
  const harvestBlock = `## 今日の収穫
・メダル: ${medal}
・アイテム: ${item}
・経験値: +${input.battle.loot.xpGained}
・累計メダル: ${medalReport(input.hunter)}
・ハンターレベル: Lv.${input.hunter.level}
・複数戦成績: ${input.battle.wins ?? "—"}勝${input.battle.losses ?? "—"}敗 / 物語ゴールド +${input.battle.goldFlavorTotal ?? 0}`;

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
${input.battle.journey ? `舞台: 『${input.battle.journey.areaName}』→ 次は『${input.battle.journey.nextAreaName}』` : ""}
${input.battle.outcomeWhy || ""}

## ${escaped ? "リベンジ戦略（次に見るべきポイント）" : "次に見るべきポイント"}
${input.battle.nextMove}

${harvestBlock}

${harvestReflection({ battle: input.battle, escaped })}

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

  const freeParts = toNoteHtml(freeBody);
  const paidParts = toNoteHtml(paidBody);

  return {
    title,
    freeBody,
    paidBody,
    freeHtml: freeParts.html,
    paidHtml: paidParts.html,
    freeLastBlockId: freeParts.lastBlockId,
    imageKeys: [...freeParts.imageKeys, ...paidParts.imageKeys],
    hashtags: noteHashtags(),
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
