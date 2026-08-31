const SENTENCE_END = /[。！？!?…]\s*$/;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;

export const SOLUNA_REPLY_LIMITS = {
  normal: 150,
  ops: 240,
} as const;

/** TTS 用 — 絵文字を除いて読み上げやすくする */
export function stripForTts(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    slice.lastIndexOf("\n"),
  ];
  const best = Math.max(...breakPoints);
  if (best >= Math.floor(maxChars * 0.45)) {
    return slice.slice(0, best + 1).trim();
  }

  return `${slice.trim()}…`;
}

/** モデル出力を完結した短文に整える（途中切れ防止） */
export function finalizeSolunaReply(
  text: string,
  options: { ops?: boolean } = {},
): string {
  const maxChars = options.ops ? SOLUNA_REPLY_LIMITS.ops : SOLUNA_REPLY_LIMITS.normal;
  const trimmed = trimAtSentence(text, maxChars);
  if (!trimmed) return "うけとりました。";
  return trimmed;
}

export function isOpsStyleQuestion(message: string): boolean {
  return /討伐|ジョブ|ブリーフィング|Note|ノート|BOINC|ボインク|資産|魔力|タンク|拠点|スケジュール|動いて|動かない|状況|今日の|他のアプリ|ディズニー|保有株|合議|コスト|WORKS|宇宙|資料生成|画像生成/i.test(
    message,
  );
}
