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
import { buildDisneyGuildNoticeForNote } from "@/lib/server/disney-note-guild-notice";
import {
  formatSolunaNewsHeadlineWithJa,
  formatSolunaNewsSummaryWithJa,
} from "@/lib/soluna-news-display";
import { stripNbspArtifacts } from "@/lib/server/soluna-note-debate-quality";

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
const RECEPTION_LABEL = "ギルド受付の子";
const CHARACTER_LABELS = [SOL_LABEL, LUNA_LABEL, RECEPTION_LABEL];

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
  // モデル／テンプレ由来の &nbsp; は Note 本文に出さない
  text = stripNbspArtifacts(text);

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
  const lunaImpression = next
    ? `そうね……あの子の言葉、わたしも同じ気持ちよ。わたしの感想としては、${next}——続きは、夜の街灯の下でゆっくりね。`
    : "そうね……あの子の言葉、わたしも同じ気持ちよ。たとえは味付け。大事なのはニュース自体が楽しく理解できること。そういう見方もあるね、で終われるのが理想よ。";
  return `## 今日の感想（人間ぽく）
${impression || "今日のニュースも、討伐を通じて立体的に見えてきた。"}

${SOL_LABEL}
${
  input.escaped
    ? "正直、取り逃がしたときは膝が笑った……でも『逃げ足の鱗』があるなら、次はもっと上手く読めるはずだ！"
    : "今日の収穫はギルドの燃料だ。受付の子が『おかえり』って微笑んでくれたのが、なんか一番嬉しかったな。"
}

${RECEPTION_LABEL}
心配していたの、あなたが無事に戻ってきたこと。

${LUNA_LABEL}
${lunaImpression}`;
}

/** 注目を引くタイトル（事実フック＋好奇心） */
export function buildCuriosityNoteTitle(input: {
  battle: SolunaBattleResult;
  dateLabel: string;
}): string {
  const plain = (input.battle.newsPlain || input.battle.newsTitle || "")
    .replace(/\s+/g, " ")
    .trim();
  const hook =
    plain.length > 36 ? `${plain.slice(0, 36)}…` : plain || input.battle.bossName;
  const escaped = input.battle.outcome === "escape";
  if (escaped) {
    return `逃げられた朝｜${hook}——ソルは何を取り逃がした？｜${input.dateLabel}`;
  }
  return `気になる朝｜${hook}——2人はどう読み解く？｜${input.dateLabel}`;
}

function newsNarrationBlock(input: {
  briefing: SolunaNewsBriefing;
  battle: SolunaBattleResult;
}): string {
  const lines = input.briefing.items.slice(0, 3).map((item, i) => {
    const headline = formatSolunaNewsHeadlineWithJa(item);
    const sum = formatSolunaNewsSummaryWithJa(item).trim();
    const sumShort =
      sum.length > 160 ? `${sum.slice(0, 160)}…` : sum;
    return `${i + 1}. ${headline}${sumShort ? `\n　→ ${sumShort}` : ""}`;
  });
  const plain = (input.battle.newsPlain || "").trim();
  return `## きょうのニュース（ナレーション・事実）
ギルド受付の子が、朝いちばんにホワイトボードへ貼った速報です。難しい言い回しは抜きで、まずは事実だけ。英語の見出しがあるときは英語のあとに日本語訳を添えます。

${lines.join("\n\n") || plain || input.briefing.summary}

このニュースを、ソルとルーナはモンスター討伐として読み解きます。ここから先が、今日の冒険です。`;
}

/** 有料掛け合いが薄いときの最低限の深読みテンプレ（空有料を防ぐ） */
function paidDialogueFallback(input: {
  battle: SolunaBattleResult;
  escaped: boolean;
}): string {
  const hook = input.battle.newsPlain || input.battle.newsTitle || input.battle.bossName;
  const nextHint =
    (input.battle.nextMove || "").trim() ||
    (input.escaped
      ? "取り逃がした急所を、明日もう一度測ること"
      : "今日の結論を1行にして、次の指標で検証すること");
  return `${SOL_LABEL}
ルーナ、さっきの前半討論の続きだ。各ニュースでは「${hook}」と言っている。でも深読みすると、今後は誰の財布と誰のスケジュールが先に動くか——そこが先に見えてくると思うんだ。
ここで疑問なのは、表の見出しが騒いでいる急所と、現場が本当に急いでいる急所が同じかどうか。推測だけど、次の発表か価格の初動で答えが一発で見えるはずだ。
だから、そういうズレを気にして動いていかないとだよね。具体的には、明日の初動を一行メモしておくこと。あ、言い過ぎた？ でも、私たちも気を付けていこう。

${LUNA_LABEL}
そういう見方もあるね。報道の言い方を受けて深読みするなら、数字の裏の「誰が急いでいて、誰が待てるか」よ。
疑問は、その急ぐ側が読者のサイフにどう波及するか。推測だけど、仕組みが見えた瞬間に誤解が一気に解けるわ。
だからこういうことを気にして動いていかないとだよね。具体的には、${nextHint}——私たちも今後気を付けていこう。読者の利点としては、明日の初動で「予想が当たったか」を一行残すだけで、ニュースの見方が変わると思うの。`;
}

type NoteMatchEncounter = {
  role: string;
  monsterName: string;
  rank: number;
  newsTitle: string;
  newsPlain: string;
  outcome: "victory" | "escape";
};

/** 報道文から「主張 vs しかし／専門家」などの対立を拾う */
export function splitNewsTension(text: string): {
  claim: string;
  counter: string | null;
} {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return { claim: "（論点の芯がまだ霧の中）", counter: null };
  const m = t.match(
    /^(.+?)(しかし|一方で|一方|だが|ただ|ところが|他方|それでも)(.+)$/,
  );
  if (m) {
    return {
      claim: m[1].trim().replace(/[。．]$/, ""),
      counter: `${m[2]}${m[3]}`.trim(),
    };
  }
  const expert = t.match(/^(.+?)((?:法学の)?専門家[^。．]{0,40}(?:は|が|たち)[^。．]*)(.*)$/);
  if (expert && expert[2]) {
    const claim = expert[1].trim().replace(/[。．]$/, "") || t.slice(0, 80);
    const counter = `${expert[2]}${expert[3] || ""}`.trim();
    return { claim, counter: counter || null };
  }
  const sentence = t.split(/[。．]/)[0]?.trim() || t;
  return {
    claim: sentence.length > 110 ? `${sentence.slice(0, 110)}…` : sentence,
    counter: null,
  };
}

function matchHeatLine(role: string, battleHeat: number): string {
  if (role === "boss") {
    return battleHeat < 0.45
      ? "大ボス枠だが、議論はもう一声。主戦場としての熱は足りない朝"
      : "本会議級の白熱——今日いちばん議論が熱くなった試合";
  }
  return "そこまで白熱するほど熱い会議ではなく終わった——だから小物モンスター";
}

function enrichPlainFromBriefing(
  enc: NoteMatchEncounter,
  briefing: SolunaNewsBriefing,
): string {
  const plain = (enc.newsPlain || "").trim();
  if (plain.length >= 40) return plain;
  const hit = briefing.items.find((item) => {
    const ja = formatSolunaNewsHeadlineWithJa(item).replace(/\n/g, " ");
    const title = item.titleJa?.trim() || item.title;
    return (
      title === enc.newsTitle ||
      ja.includes(enc.newsTitle) ||
      enc.newsTitle.includes(title.slice(0, 12)) ||
      formatSolunaNewsSummaryWithJa(item).includes(plain.slice(0, 20))
    );
  });
  if (!hit) return plain || enc.newsTitle;
  return formatSolunaNewsSummaryWithJa(hit) || plain || enc.newsTitle;
}

function resolveNoteMatches(input: {
  battle: SolunaBattleResult;
  briefing: SolunaNewsBriefing;
}): NoteMatchEncounter[] {
  const fromBattle = (input.battle.encounters ?? []).map((enc) => ({
    role: enc.role,
    monsterName: enc.monsterName,
    rank: enc.rank,
    newsTitle: enc.newsTitle,
    newsPlain: enc.newsPlain,
    outcome: enc.outcome,
  }));
  if (fromBattle.length > 0) return fromBattle;

  const items = input.briefing.items.slice(0, 3);
  if (items.length === 0) {
    return [
      {
        role: "boss",
        monsterName: input.battle.bossName,
        rank: input.battle.bossRank,
        newsTitle: input.battle.newsTitle || input.battle.bossName,
        newsPlain: input.battle.newsPlain || "",
        outcome: input.battle.outcome,
      },
    ];
  }
  return items.map((item, index) => {
    const isBoss = index === items.length - 1;
    return {
      role: isBoss ? "boss" : index === 0 ? "trash" : "mid",
      monsterName: isBoss
        ? input.battle.bossName
        : `Lv.${item.monster?.rank ?? 2} ${item.monster?.name ?? formatSolunaNewsHeadlineWithJa(item).split("\n")[0]}`,
      rank: item.monster?.rank ?? (isBoss ? input.battle.bossRank : 2),
      newsTitle: formatSolunaNewsHeadlineWithJa(item).split("\n")[0] || item.title,
      newsPlain: formatSolunaNewsSummaryWithJa(item) || item.summary,
      outcome: isBoss ? input.battle.outcome : "victory",
    };
  });
}

/**
 * 有料: 1試合ごとの丁寧な討論（対立する見方の中身まで）。
 * 依頼例: 「企業が…法的責任を負うべき。しかし法学の専門家たちは…」→ 専門家側の議論。
 */
export function formatPaidPerMatchDebates(input: {
  battle: SolunaBattleResult;
  briefing: SolunaNewsBriefing;
}): string {
  const matches = resolveNoteMatches(input);
  const heat = input.battle.heat ?? 0.5;
  const blocks = matches.map((enc, index) => {
    const plain = enrichPlainFromBriefing(enc, input.briefing);
    const { claim, counter } = splitNewsTension(plain);
    const roleLabel =
      enc.role === "boss" ? "大ボス戦" : enc.role === "mid" ? "中ボス戦" : "小物戦";
    const heatLine = matchHeatLine(enc.role, heat);
    const counterFocus =
      counter ||
      "表の主張の裏側——誰が得をして、誰がリスクを引き受けるか";
    const resultLabel = enc.outcome === "victory" ? "討伐成功" : "取り逃がし";

    return `### 第${index + 1}試合（${roleLabel}）：vs ${enc.monsterName}（Lv.${enc.rank}）

白熱状況: ${heatLine}
結果: 【${resultLabel}】

${SOL_LABEL}
各ニュースではこう言っている。「${claim}」。${
      counter
        ? `でも続きがある——「${counter}」。`
        : "でも深読みすると、この一文の先にまだ急所がある。"
    }
俺が掘りたいのは後段だ。${
      /専門家/.test(counterFocus)
        ? "「専門家たち」が何を根拠にそう言うのか、そこを飛ばすと討論が空っぽになる。"
        : `対立の芯は「${counterFocus.slice(0, 80)}${counterFocus.length > 80 ? "…" : ""}」だと思う。`
    }
疑問は、読者がどっちの立場を自分のサイフや仕事に引きつけるべきか、だ。推測だけど、見出しの勢いより、後段の条件や留保のほうが明日効く。
${
      enc.role === "boss"
        ? "だから今日の本会議はここだ。気を付けて動こう——具体的には、この対立のどちら側の発表が次に来るかをメモすること。私たちも気を付けていこう。"
        : "ただ、ここまで白熱するほど熱い会議にはならなかった。論点はあるけど着地が早い——だから小物モンスターだったんだ。それでも、この対立は見逃さない。"
    }

${LUNA_LABEL}
そういう見方もあるね。報道の前半だけ読んで満足するのは危険よ。わたしが丁寧に見たいのは、「${counterFocus.slice(0, 90)}${counterFocus.length > 90 ? "…" : ""}」の中身。
${
  /専門家|法学/.test(`${claim}${counterFocus}`)
    ? "法学の専門家たちが何を守ろうとしているのか——企業責任の線引きなのか、技術の制御可能性なのか——そこを言葉にしないと、ただのスローガン討論で終わるわ。"
    : "表の主張を受けて、反対側／留保側が何を言っているかを同じ息で話す。それがこの試合の丁寧な討論よ。"
}
疑問は、明日の読者にとって「どちらが先に動く事実」か。推測だけど、${enc.role === "boss" ? "大ボス級の熱があるなら、次の指標で検証できるはず" : "小物戦でも、対立の型だけは覚えておく価値があるわ"}。
だからこういうことを気にして動いていかないとだよね。具体的には、この試合の対立を一行で残すこと——私たちも今後気を付けていこう。`;
  });

  return `## 試合ごとの丁寧な討論（有料）

1試合ずつ、報道の主張と「しかし／専門家側」などの対立を掘ります。白熱しなかった試合は小物——熱い会議だった試合が大ボスです。

${blocks.join("\n\n")}`;
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
  const paidDialogueRaw = dialogueLines(allMessages.slice(2));
  // 空の掛け合い（字数だけある／深読み骨格なし）はフォールバックで埋める
  const paidHasDepth =
    /深読み|疑問|推測|気を付け|具体的に/.test(paidDialogueRaw) &&
    paidDialogueRaw.trim().length >= 120;
  const paidDialogue = paidHasDepth
    ? paidDialogueRaw
    : paidDialogueFallback({ battle: input.battle, escaped });

  const creator = process.env.NOTE_CREATOR_URLNAME?.trim();
  const shopLine = creator ? `https://note.com/${creator}` : "このマガジンの有料購読";
  const assets = input.assets ?? null;
  const boincMinutes = input.boinc?.result?.runMinutesActual ?? input.boincMinutes;
  const boincCredit = input.boinc?.result?.creditGranted;

  const title = buildCuriosityNoteTitle({ battle: input.battle, dateLabel });

  const disclaimer = `※このnoteはAIがニュースを討伐するゲームです。初めての方は設定ページをご覧ください。
設定ページ: ${NOTE_SETTINGS_GUIDE_URL}`;

  const escapeHook = escaped
    ? `
## 取り逃がしたからこそ、続きが気になる
負けた記事ではありません。${boss}に逃げられたからこそ、有料エリアでは次が読めます。

・リベンジ戦略: 次に同じ系統が来たときの弱点（市場の見通し・防衛策）
・逃げ足の鱗: 今日の失敗ログから読む、ポートフォリオ防衛の一手
・反省会の白熱: ドジなソルと、優しくてしたたかなルーナの掛け合い全文`
    : `
## 討伐成功の先にあるもの
有料エリアでは、激闘の続きと収穫の使い道まで読めます。

・激闘の裏側: 白熱した第2ラウンド全文
・戦利品の使い道: メダル運用と宇宙分析への変換レポート
・次の狩り場: 明日狙うべきニュースの急所`;

  const paywallTeaser = escaped
    ? `${LUNA_LABEL}
大丈夫、ソル。逃げられた朝は、ギルド受付の子も心配そうにしていたわ。
でもね——${input.battle.bossName} が落とした『逃げ足の鱗』には、サイフを守るヒントがまだ眠っている。続きは、静かに深掘りしましょう。`
    : `${LUNA_LABEL}
討伐はできたわ。でも収穫の使い道と、次に来る急所は、まだ話していない。
ギルドの灯りが落ちる前に——続きが気になるなら↓へ。`;

  const adventureLog = formatAdventureLogForNote(input.battle);
  const factBlock = newsNarrationBlock({
    briefing: input.briefing,
    battle: input.battle,
  });
  const paidPerMatchDebates = formatPaidPerMatchDebates({
    battle: input.battle,
    briefing: input.briefing,
  });

  // キャラ画像は見出し（eyecatch）のみ。本文へ aquacore 直リンクを置くと
  // note 公開時に「本文に利用できない内容が含まれています」で拒否される。
  const freeBody = `${disclaimer}

${SOL_LABEL} ／ ${LUNA_LABEL}
今日もニュースをモンスターに変えて、2人が世界を旅しながら討伐に挑みます。
まず事実を知り、それから物語でハラハラしながら理解する——それがこのギルドの朝の流儀です。

無料パートでは、各試合ごとの「気になる点」と、議論の白熱状況（小物戦か大ボス級か）が読めます。有料パートでは、1試合ごとの丁寧な討論——「しかし／専門家たちは…」など対立する見方の中身まで掘ります。
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

${factBlock}

## そんなニュースを、彼らはどう読み解くか

${adventureLog}

## 2人の掛け合い（ダイジェスト・前半討論）

事実を受け止めたあと、「面白いことが起きるぞー／心配な点があるぞー」の入口までが無料パートです。ここでも、各試合の気になる点と白熱状況が読めるようにしています。

${freeDialogue || "（本日は偵察戦から始まります）"}

${paywallTeaser}

---
✂️ （ここから有料） ✂️
---

【有料エリアの先にあるもの】
・試合ごとの丁寧な討論: 1試合ずつ、報道の主張と「しかし／専門家側」の対立まで
・激闘の続き: 深掘り・予想・白熱した掛け合い全文
・${escaped ? "リベンジ戦略" : "収穫レポート"}: ${escaped ? "次の防衛策と市場の見通し" : "メダル・アイテムの使い道"}
・召喚獣育成: リアルな保有状況＋物語の感想
・拠点都市開拓: 街の成長と、受付の子や風景への想い

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

  const paidBody = `有料購読のあなたへ。1試合ごとの丁寧な討論、深掘りと予想、白熱の続き、そして今日のギルド全仕事レポートです。

${paidPerMatchDebates}

## 2人の掛け合い（有料限定・激闘の裏側）

前半討論の先——予想と深掘りで、議論を楽しむパートです。

${paidDialogue}

${
  escaped
    ? `${SOL_LABEL}
くっそー！${input.battle.bossName} に逃げられちまった……膝が笑ってる。でも次の一手は、もう見えているはずだ。

${LUNA_LABEL}
焦らないで。あなたの弱さを見せてくれたから、私も本気で立て直せる。奴が落とした『逃げ足の鱗』を読めば、次の弱点が丸裸になるわ。`
    : `${SOL_LABEL}
今日の討伐は決まった！……あっ、ポーション落とした。まあいいか、収穫はギルドの燃料にするぞ！

${LUNA_LABEL}
ふふ、そういうところよ。勝ち逃げも大事。財務報告と拠点開拓に回しましょう——受付の子も、あなたの無事を待っているわ。`
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

${buildDisneyGuildNoticeForNote()}

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
