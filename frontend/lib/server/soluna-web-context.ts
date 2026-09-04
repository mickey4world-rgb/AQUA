/**
 * 人間チャット向け：質問に合わせてインターネット／SNS の最新情報を拾う
 */
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import { isOpsStyleQuestion } from "@/lib/soluna-reply";

const CHAT_SEARCH_TIMEOUT_MS = 12_000;

/** ギルド内状況ではなく、世間・最新情報を求めているか */
export function needsLiveWorldContext(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  // ギルド作戦そのものの質問は討伐コンテキストで足りる
  if (
    isOpsStyleQuestion(text) &&
    !/世間|世の中|ニュース|最新|トレンド|SNS|速報|海外|経済|政治/i.test(text)
  ) {
    return false;
  }

  return /ニュース|最新|世間|世の中|トレンド|話題|SNS|ツイッター|Twitter|\bX\b|インスタ|Reddit|速報|いま何|今何|最近の|今日の(?:天気|株|円|ニュース)|円安|円高|円相場|日経|為替|株価|選挙|地震|台風|天気|戦争|停戦|炎上|バズ|発表|リリース|どうなってる|調べて|検索して/i.test(
    text,
  );
}

export async function fetchLiveWorldContextForChat(
  userMessage: string,
  options?: { voiceMode?: boolean },
): Promise<string | null> {
  if (!needsLiveWorldContext(userMessage)) return null;

  const compact = options?.voiceMode === true;
  const result = await generateWithGoogleSearch({
    system: `あなたは最新情報リサーチャーです。Google 検索（必要なら公開 SNS・ニュースサイト）で直近の事実を調べ、日本語で簡潔にまとめます。
- 推測・噂は「未確認」と明記する
- ソース名と日付（分かれば）を付ける
- 政治・医療・投資は断定を避け、事実と出典中心
- ギルド（Soluna）の討伐物語とは混ぜない`,
    userPrompt: compact
      ? `次の質問に答えるための最新事実を、3行以内・合計200字以内で要約してください。\n質問: ${userMessage}`
      : `次のユーザー質問に答えるために必要な最新情報を調べてください。

質問: ${userMessage}

出力形式（このまま）:
## 最新ウェブ／SNS情報（調査時刻: JST）
- 要点1（出典・日付）
- 要点2（出典・日付）
- 要点3（あれば）
注意: （未確認点があれば1行）

合計400字以内。余分な前置きは不要。`,
    timeoutMs: CHAT_SEARCH_TIMEOUT_MS,
  });

  if (!result.ok) {
    console.warn("[soluna-web-context]", result.reason);
    return `## 最新ウェブ／SNS情報
（いま検索を取れませんでした: ${result.reason}。推測で埋めず、分かる範囲と一般知識の範囲で答えてください。）`;
  }

  const text = result.text.trim();
  if (!text) return null;

  return `## 最新ウェブ／SNS情報（Google 検索 grounding · ${result.model}）
${text.slice(0, compact ? 320 : 900)}

使い方: ユーザーの質問が世間・最新情報なら、上記を根拠に答える。ギルド討伐の話と混ぜない。事実が無い部分は捏造しない。`.trim();
}
