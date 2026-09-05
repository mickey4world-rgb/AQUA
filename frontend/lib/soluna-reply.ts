const SENTENCE_END = /[。！？!?…]\s*$/;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;

export const SOLUNA_REPLY_LIMITS = {
  /** テキストチャット（通常） */
  normal: 420,
  /** 状況・ジョブなど説明が必要な質問 */
  ops: 560,
  /** 音声会話モード — 即答のため短め */
  voice: 100,
  voiceOps: 120,
  /** 音声掛け合いの2人目 */
  voiceSupport: 60,
} as const;

/** TTS 用 — 絵文字を除き、読み上げやすい句読点に整える */
export function stripForTts(text: string): string {
  return prepareForTts(text);
}

export function prepareForTts(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/[#*_`>~\[\]()]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[…]{2,}/g, "。")
    .replace(/[！!]{2,}/g, "！")
    .replace(/[？?]{2,}/g, "？")
    // 数値の範囲だけ「から」（「〜かな」は伸ばし音に）
    .replace(/(\d)\s*[〜~－]\s*(\d)/g, "$1から$2")
    .replace(/[〜~]/g, "ー")
    .replace(/℃/g, "度")
    .replace(/%/g, "パーセント")
    .replace(/km\/h/gi, "キロメートル毎時")
    .replace(/\s*[/／]\s*/g, "、")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * 音声向けに、堅い書き言葉を少し口語へ寄せる（読み上げ前処理）
 */
export function humanizeSpokenJapanese(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  if (!out) return out;

  out = out
    .replace(/させていただきます/g, "します")
    .replace(/いたします/g, "します")
    .replace(/でございます/g, "です")
    .replace(/ではありませんか/g, "じゃないかな")
    .replace(/でしょうか/g, "かな")
    .replace(/ですよね/g, "だよね")
    .replace(/ですね([。！？]|$)/g, "ね$1")
    .replace(/ご質問ありがとうございます[。．]?/g, "")
    .replace(/結論としては[、,]?/g, "")
    .replace(/まず最初に[、,]?/g, "")
    .replace(/承知いたしました/g, "わかった")
    .replace(/承知しました/g, "わかった")
    .replace(/かしこまりました/g, "了解")
    .replace(/\s{2,}/g, " ")
    .trim();

  return out;
}

/** 文・節単位に分割して棒読み感を減らす（やや長めの塊で自然に） */
export function splitTtsChunks(text: string, maxLen = 72): string[] {
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
  options: { ops?: boolean; voice?: boolean; voiceSupport?: boolean } = {},
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "うけとりました。";

  if (options.voice) {
    const spoken = humanizeSpokenJapanese(normalized);
    const maxChars = options.voiceSupport
      ? SOLUNA_REPLY_LIMITS.voiceSupport
      : options.ops
        ? SOLUNA_REPLY_LIMITS.voiceOps
        : SOLUNA_REPLY_LIMITS.voice;
    return trimAtSentence(spoken || normalized, maxChars);
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
  // 「今日の気分」など雑談を誤検知しないよう、ギルド／アプリ語彙に絞る
  return /討伐|ジョブ|ブリーフィング|Note|ノート|BOINC|ボインク|資産|魔力|タンク|拠点|スケジュール|動いて|動かない|ギルド|他のアプリ|ディズニー|保有株|合議|コスト|WORKS|宇宙|資料生成|画像生成|今日の(討伐|ジョブ|状況|作戦|スケジュール)/i.test(
    message,
  );
}

/**
 * 世間・最新情報を求める質問（ウェブ／SNS 検索対象）。
 * 雑談を誤って検索するとチャットが遅延・タイムアウトするため、明確な時事意図に絞る。
 */
export const WORLD_INFO_RE =
  /ニュース|最新情報|世間|世の中|トレンド|話題|SNS|ツイッター|Twitter|\bX\b|インスタ|Instagram|Reddit|速報|いま何が|今何が|最近のニュース|ネットで|ウェブで|Webで|ググって|円安|円高|円相場|日経|為替|株価|相場|選挙|地震|台風|天気|天候|予報|気温|降水|晴れ|くもり|曇り|雨|雪|戦争|停戦|炎上|バズ|気象|傘持|服装|首相|総理|大統領|内閣|大臣|知事|市長|現職|就任|当選|オリパ|五輪|オリンピック|ワールドカップ|試合結果|スコア|優勝|敗退|bitcoin|ビットコイン|BTC|イーサ|Ethereum|ドル円|金価格|原油|コロナ|COVID|停戦合意|政権|与党|野党|国会|皇室|天皇|新内閣|組閣|訃報|事件|事故|公式発表/i;

/** 世間ニュース・最新情報を求める質問（返答をやや長くしてよい） */
export function isWorldInfoQuestion(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (WORLD_INFO_RE.test(text)) return true;
  // 公人・数値の明確な事実質問のみ（「誰か来た？」等の雑談は除外）
  return /(?:首相|総理|大統領|大臣|知事|市長).*(?:誰|だれ|何歳)|(?:株価|相場|為替|円).*(?:いくら|何円)|(?:は|って)(誰|だれ)(?:？|\?|$)/.test(
    text,
  );
}
