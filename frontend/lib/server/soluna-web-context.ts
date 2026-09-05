/**
 * 人間チャット向け：質問に合わせてインターネット／SNS の最新情報を拾う
 */
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import {
  fetchOpenMeteoWeatherContext,
  isWeatherQuestion,
} from "@/lib/server/soluna-weather";
import { isOpsStyleQuestion, isWorldInfoQuestion } from "@/lib/soluna-reply";

/** 速さ優先（正確さは検索結果依存。途中打ち切りはしない） */
const CHAT_SEARCH_TIMEOUT_MS = 10_000;
const VOICE_SEARCH_TIMEOUT_MS = 7_000;

/** @deprecated isWorldInfoQuestion に統合。互換のため残す */
export const LIVE_WORLD_RE = /ニュース|最新|世間|SNS|速報|首相|総理|大統領|誰|だれ/i;

/** ギルド内状況ではなく、世間・最新情報を求めているか */
export function needsLiveWorldContext(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (isWeatherQuestion(text)) return true;

  // ギルド作戦そのものの質問は討伐コンテキストで足りる
  if (isOpsStyleQuestion(text) && !isWorldInfoQuestion(text)) {
    return false;
  }

  return isWorldInfoQuestion(text);
}

const RESEARCHER_SYSTEM = `あなたは最新情報リサーチャーです。Google 検索でウェブニュースと SNS（X/Twitter・Reddit・Instagram 言及・掲示板）の直近事実を調べ、日本語で簡潔にまとめます。
- 首相・大統領・大臣・相場・試合結果・事件など「いま」の事実は現在の正確な固有名詞・数値を入れる
- ウェブ公式・大手ニュースと、SNS上の反応（炎上・バズ・当事者投稿）を区別して書く
- 天気予報は都市名が無ければ東京周辺
- 推測・噂は「未確認」と明記。ソース名と日付（分かれば）を付ける
- ギルド（Soluna）の討伐物語とは混ぜない
- 「自分で調べて」などユーザーへの丸投げは書かない
- 前置き不要。要点だけ。`;

function buildCombinedPrompt(userMessage: string, compact: boolean): string {
  if (compact) {
    return `質問に答える最新事実を、ウェブ＋SNSから急いで調べ3行以内・合計220字で要約。固有名詞は正確に。SNS反応があれば1点入れる。
質問: ${userMessage}`;
  }
  return `次の質問に必要な最新情報を、ウェブ検索と SNS 検索の両方から急いで調べてください。

質問: ${userMessage}

出力（このまま）:
## 最新ウェブ／SNS情報（調査時刻: JST）
- ウェブ: 要点（出典・日付）
- SNS: 反応・当事者投稿の要点（あれば。無ければ「目立ったSNS反応なし」）
- 補足: （未確認点があれば1行）

合計380字以内。余分な前置き禁止。`;
}

export async function fetchLiveWorldContextForChat(
  userMessage: string,
  options?: { voiceMode?: boolean },
): Promise<string | null> {
  if (!needsLiveWorldContext(userMessage)) return null;

  const compact = options?.voiceMode === true;
  const wantWeather = isWeatherQuestion(userMessage);
  const searchTimeout = compact ? VOICE_SEARCH_TIMEOUT_MS : CHAT_SEARCH_TIMEOUT_MS;
  const wantSnsExtra =
    /SNS|ツイッター|Twitter|\bX\b|インスタ|Reddit|炎上|バズ|トレンド|話題/i.test(
      userMessage,
    );

  const snsExtraPrompt = compact
    ? `質問について X/Twitter・Reddit・SNS の直近反応だけを2行・160字以内で要約。無ければ「目立った反応なし」。\n質問: ${userMessage}`
    : `質問について SNS（X/Twitter、Reddit、Instagram言及、掲示板）の直近反応を急いで調べてください。

質問: ${userMessage}

出力:
## SNS反応（JST）
- 要点1（媒体・日付）
- 要点2（あれば）
合計220字以内。噂は未確認と書く。`;

  const [weatherBlock, grounded, snsExtra] = await Promise.all([
    wantWeather ? fetchOpenMeteoWeatherContext(userMessage) : Promise.resolve(null),
    generateWithGoogleSearch({
      system: RESEARCHER_SYSTEM,
      userPrompt: buildCombinedPrompt(userMessage, compact),
      timeoutMs: searchTimeout,
      preferFast: true,
      maxOutputTokens: compact ? 512 : 768,
    }),
    wantSnsExtra
      ? generateWithGoogleSearch({
          system: RESEARCHER_SYSTEM,
          userPrompt: snsExtraPrompt,
          timeoutMs: Math.min(searchTimeout, compact ? 6_000 : 8_000),
          preferFast: true,
          maxOutputTokens: 384,
        })
      : Promise.resolve(null),
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
  }

  if (snsExtra?.ok && snsExtra.text.trim()) {
    sections.push(
      `## SNS補足（${snsExtra.model}）
${snsExtra.text.trim().slice(0, compact ? 280 : 520)}`,
    );
  }

  if (!grounded.ok && !snsExtra?.ok && !weatherBlock) {
    console.warn(
      "[soluna-web-context]",
      grounded.ok ? "empty" : grounded.reason,
    );
    sections.push(`## 最新ウェブ／SNS情報
（外部検索をいま十分に取れませんでした${grounded.ok ? "" : `: ${grounded.reason}`}。
【必須】古い一般知識で現職・相場・速報・試合結果を断定しない。
分かる範囲の伴走だけし、「いま最新を取り切れなかった。もう一度聞いて」と伝える。
「検索できない」「自分で調べて」と突き放さない。）`);
  } else if (!grounded.ok) {
    console.warn(
      "[soluna-web-context] grounding skipped; other sources ok",
      grounded.reason,
    );
  }

  if (sections.length === 0) return null;

  return `${sections.join("\n\n")}

使い方（必須）:
- 世間・天気・時事・現職・数値・SNS動向の質問なら、上記を唯一の根拠として自然に急いで答える。
- 「自分で調べて／ググって／別の方法で調べて」などユーザーへの丸投げは禁止。
- ギルド討伐の話と混ぜない。上記に無い現職・数値は捏造しない。`.trim();
}
