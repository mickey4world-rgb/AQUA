/**
 * 人間チャット向け：質問に合わせてインターネット／SNS の最新情報を拾う
 */
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import {
  fetchOpenMeteoWeatherContext,
  isWeatherQuestion,
} from "@/lib/server/soluna-weather";
import { isOpsStyleQuestion } from "@/lib/soluna-reply";

const CHAT_SEARCH_TIMEOUT_MS = 20_000;
const VOICE_SEARCH_TIMEOUT_MS = 8_000;

const LIVE_WORLD_RE =
  /ニュース|最新|世間|世の中|トレンド|話題|SNS|ツイッター|Twitter|\bX\b|インスタ|Reddit|速報|いま何|今何|最近の|今日の|明日の|あしたの|きょうの|円安|円高|円相場|日経|為替|株価|選挙|地震|台風|天気|天候|予報|気温|降水|晴れ|くもり|曇り|雨|雪|戦争|停戦|炎上|バズ|発表|リリース|どうなってる|調べて|検索して|教えて|情報|気象|傘|服装/i;

/** ギルド内状況ではなく、世間・最新情報を求めているか */
export function needsLiveWorldContext(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (isWeatherQuestion(text)) return true;

  // ギルド作戦そのものの質問は討伐コンテキストで足りる
  if (
    isOpsStyleQuestion(text) &&
    !/世間|世の中|ニュース|最新|トレンド|SNS|速報|海外|経済|政治|天気|予報/i.test(text)
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
- 天気予報・気温・降水の質問では、都市名が無ければ東京周辺として調べる
- 推測・噂は「未確認」と明記する
- ソース名と日付（分かれば）を付ける
- 政治・医療・投資は断定を避け、事実と出典中心
- ギルド（Soluna）の討伐物語とは混ぜない`,
      userPrompt: compact
        ? `次の質問に答えるための最新事実を、3行以内・合計220字以内で要約してください。\n質問: ${userMessage}`
        : `次のユーザー質問に答えるために必要な最新情報を調べてください。

質問: ${userMessage}

出力形式（このまま）:
## 最新ウェブ／SNS情報（調査時刻: JST）
- 要点1（出典・日付）
- 要点2（出典・日付）
- 要点3（あれば）
注意: （未確認点があれば1行）

合計400字以内。余分な前置きは不要。`,
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
${grounded.text.trim().slice(0, compact ? 320 : 900)}`,
    );
  } else if (!weatherBlock) {
    console.warn("[soluna-web-context]", grounded.ok ? "empty" : grounded.reason);
    sections.push(`## 最新ウェブ／SNS情報
（外部検索をいま十分に取れませんでした${grounded.ok ? "" : `: ${grounded.reason}`}。
一般知識の範囲で丁寧に答え、最新の細かい数値は断定しないでください。
「検索できない」とだけ突き放さないでください。）`);
  } else {
    // 天気は取れたので、検索失敗は軽く添えるだけ
    console.warn("[soluna-web-context] grounding skipped; weather ok", grounded.ok ? "empty" : grounded.reason);
  }

  if (sections.length === 0) return null;

  return `${sections.join("\n\n")}

使い方: ユーザーの質問が世間・天気・最新情報なら、上記を根拠に自然な会話で答える。ギルド討伐の話と混ぜない。事実が無い部分は捏造しない。`.trim();
}
