/**
 * 人間チャット向け：質問に合わせてインターネット／SNS の最新情報を拾う
 */
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import {
  fetchOpenMeteoWeatherContext,
  isWeatherQuestion,
} from "@/lib/server/soluna-weather";
import { isOpsStyleQuestion } from "@/lib/soluna-reply";

const CHAT_SEARCH_TIMEOUT_MS = 18_000;
const VOICE_SEARCH_TIMEOUT_MS = 12_000;

/**
 * 時事・公人・数値はモデルの古い知識で答えず、必ず検索する。
 * 「日本の首相は誰」のような短文も拾う。
 */
export const LIVE_WORLD_RE =
  /ニュース|最新|世間|世の中|トレンド|話題|SNS|ツイッター|Twitter|\bX\b|インスタ|Reddit|速報|いま何|今何|最近の|今日の|明日の|あしたの|きょうの|円安|円高|円相場|日経|為替|株価|選挙|地震|台風|天気|天候|予報|気温|降水|晴れ|くもり|曇り|雨|雪|戦争|停戦|炎上|バズ|発表|リリース|どうなってる|調べて|検索して|教えて|情報|気象|傘|服装|首相|総理|大統領|内閣|大臣|知事|現職|現在の|いまの|今の|誰|だれ|何歳|就任|当選|オリパ|五輪|オリンピック|ワールドカップ|bitcoin|ビットコイン|BTC|イーサ|Ethereum|ドル円|金価格|原油|コロナ|COVID|停戦合意|政権|与党|野党|国会|皇室|天皇|新内閣|組閣/i;

/** ギルド内状況ではなく、世間・最新情報を求めているか */
export function needsLiveWorldContext(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (isWeatherQuestion(text)) return true;

  // ギルド作戦そのものの質問は討伐コンテキストで足りる
  if (
    isOpsStyleQuestion(text) &&
    !/世間|世の中|ニュース|最新|トレンド|SNS|速報|海外|経済|政治|天気|予報|首相|総理|大統領|選挙/i.test(
      text,
    )
  ) {
    return false;
  }

  return LIVE_WORLD_RE.test(text);
}

export async function fetchLiveWorldContextForChat(
  userMessage: string,
  options?: { voiceMode?: boolean },
): Promise<string | null> {
  if (!needsLiveWorldContext(userMessage)) return null;

  const compact = options?.voiceMode === true;
  const wantWeather = isWeatherQuestion(userMessage);
  const searchTimeout = compact ? VOICE_SEARCH_TIMEOUT_MS : CHAT_SEARCH_TIMEOUT_MS;

  const [weatherBlock, grounded] = await Promise.all([
    wantWeather ? fetchOpenMeteoWeatherContext(userMessage) : Promise.resolve(null),
    generateWithGoogleSearch({
      system: `あなたは最新情報リサーチャーです。Google 検索で直近の事実を調べ、日本語で簡潔にまとめます。
- 人名の現職（首相・大統領・大臣など）は「現在の正確な氏名」を必ず入れる
- 天気予報・気温・降水の質問では、都市名が無ければ東京周辺として調べる
- 推測・噂は「未確認」と明記する
- ソース名と日付（分かれば）を付ける
- 政治・医療・投資は断定を避け、事実と出典中心
- ギルド（Soluna）の討伐物語とは混ぜない
- 「自分で調べて」などユーザーへの丸投げ指示は書かない`,
      userPrompt: compact
        ? `次の質問に答えるための最新事実を、3行以内・合計240字以内で要約してください。現職・固有名詞は正確に。\n質問: ${userMessage}`
        : `次のユーザー質問に答えるために必要な最新情報を調べてください。

質問: ${userMessage}

出力形式（このまま）:
## 最新ウェブ／SNS情報（調査時刻: JST）
- 要点1（出典・日付）
- 要点2（出典・日付）
- 要点3（あれば）
注意: （未確認点があれば1行）

合計450字以内。余分な前置きは不要。現職者の氏名は必ず正確に。`,
      timeoutMs: searchTimeout,
    }),
  ]);

  const sections: string[] = [];

  if (weatherBlock) {
    sections.push(weatherBlock);
  }

  if (grounded.ok && grounded.text.trim()) {
    sections.push(
      `## 最新ウェブ／SNS情報（Google 検索 grounding · ${grounded.model}）
${grounded.text.trim().slice(0, compact ? 420 : 1100)}`,
    );
  } else if (!weatherBlock) {
    console.warn("[soluna-web-context]", grounded.ok ? "empty" : grounded.reason);
    sections.push(`## 最新ウェブ／SNS情報
（外部検索をいま十分に取れませんでした${grounded.ok ? "" : `: ${grounded.reason}`}。
【必須】古い一般知識で首相・大統領・株価・速報を断定しない。
分かる範囲の伴走だけし、「いま最新を取り切れなかった。もう一度聞いて」と伝える。
「検索できない」「自分で調べて」と突き放さない。）`);
  } else {
    console.warn(
      "[soluna-web-context] grounding skipped; weather ok",
      grounded.ok ? "empty" : grounded.reason,
    );
  }

  if (sections.length === 0) return null;

  return `${sections.join("\n\n")}

使い方（必須）:
- 世間・天気・時事・現職・数値の質問なら、上記を唯一の根拠として自然に答える。
- 「自分で調べて／ググって／別の方法で調べて」などユーザーへの丸投げは禁止。
- ギルド討伐の話と混ぜない。上記に無い現職・数値は捏造しない。`.trim();
}
