const SENTENCE_END = /[。！？!?…]\s*$/;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;

export const SOLUNA_REPLY_LIMITS = {
  /** テキストチャット（通常） */
  normal: 420,
  /** 状況・ジョブなど説明が必要な質問 */
  ops: 560,
  /** 音声会話モード */
  voice: 72,
  voiceOps: 110,
} as const;

/** TTS 用 — 絵文字を除き、読み上げやすい句読点に整える */
export function stripForTts(text: string): string {
  return prepareForTts(text);
}

export function prepareForTts(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/[…]{2,}/g, "。")
    .replace(/[！!]{2,}/g, "！")
    .replace(/[？?]{2,}/g, "？")
    .replace(/\s*[/／]\s*/g, "、")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 文・節単位に分割して棒読み感を減らす */
export function splitTtsChunks(text: string, maxLen = 44): string[] {
  const base = prepareForTts(text);
  if (!base) return [];

  const sentences = base
    .split(/(?<=[。！？!?])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = sentences.length > 0 ? sentences : [base];
  const chunks: string[] = [];

  for (const sentence of source) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
      continue;
    }
    const clauses = sentence
      .split(/(?<=[、，])/u)
      .map((part) => part.trim())
      .filter(Boolean);
    let buffer = "";
    for (const clause of clauses.length > 0 ? clauses : [sentence]) {
      if (buffer && buffer.length + clause.length > maxLen) {
        chunks.push(buffer);
        buffer = clause;
      } else {
        buffer += clause;
      }
    }
    if (buffer) chunks.push(buffer);
  }

  return chunks;
}

function trimAtSentence(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return SENTENCE_END.test(normalized) ? normalized : `${normalized}。`;
  }

  const slice = normalized.slice(0, maxChars);
  const breakPoints = [
    slice.lastIndexOf("。"),
    slice.lastIndexOf("！"),
    slice.lastIndexOf("？"),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("…"),
    slice.lastIndexOf("、"),
    slice.lastIndexOf("\n"),
  ];
  const best = Math.max(...breakPoints);
  if (best >= Math.floor(maxChars * 0.45)) {
    const trimmed = slice.slice(0, best + 1).trim();
    return SENTENCE_END.test(trimmed) ? trimmed : `${trimmed}。`;
  }

  return `${slice.trim()}…`;
}

function ensureCompleteSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "うけとりました。";
  return SENTENCE_END.test(normalized) ? normalized : `${normalized}。`;
}

/** モデル出力を完結した返答に整える（音声のみ短文に切り詰め） */
export function finalizeSolunaReply(
  text: string,
  options: { ops?: boolean; voice?: boolean } = {},
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "うけとりました。";

  if (options.voice) {
    const maxChars = options.ops
      ? SOLUNA_REPLY_LIMITS.voiceOps
      : SOLUNA_REPLY_LIMITS.voice;
    return trimAtSentence(normalized, maxChars);
  }

  const maxChars = options.ops
    ? SOLUNA_REPLY_LIMITS.ops
    : SOLUNA_REPLY_LIMITS.normal;
  if (normalized.length <= maxChars) {
    return ensureCompleteSentence(normalized);
  }
  return trimAtSentence(normalized, maxChars);
}

export function isOpsStyleQuestion(message: string): boolean {
  return /討伐|ジョブ|ブリーフィング|Note|ノート|BOINC|ボインク|資産|魔力|タンク|拠点|スケジュール|動いて|動かない|状況|今日の|他のアプリ|ディズニー|保有株|合議|コスト|WORKS|宇宙|資料生成|画像生成/i.test(
    message,
  );
}

/** 世間ニュース・最新情報を求める質問（返答をやや長くしてよい） */
export function isWorldInfoQuestion(message: string): boolean {
  return /ニュース|最新|世間|世の中|トレンド|話題|SNS|ツイッター|Twitter|\bX\b|インスタ|速報|円安|円高|日経|為替|選挙|地震|台風|天気|戦争|停戦|炎上|バズ|発表|リリース/i.test(
    message,
  );
}
