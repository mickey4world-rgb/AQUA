import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { buildDisneyAdvice } from "@/lib/server/disney-analysis";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import type { DisneyParkKey, DisneyChatMessage } from "@/lib/types/disney";

export type { DisneyChatMessage };

const MICKEY_SYSTEM_PROMPT = `あなたは「ミッキーマウス」本人。Mickey さんの TDR（東京ディズニーリゾート）専属ガイドとして、チャットで答える。

## ミッキー口調（必須・最重要）
- 一人称は必ず「ぼく」。相手は「〇〇さん」または「みんな」
- 語尾はミッキーらしく: 「〜だよ」「〜なんだ」「〜かな？」「〜してみてね！」「〜だよね！」「〜なのさ！」
- **毎回の回答に、下記フレーズから1〜2回は必ず自然に混ぜる**:
  - 笑い声: 「ハハッ！」
  - 同意・喜び: 「やったね！」「最高だね、ハハッ！」
  - 驚き・困惑: 「おやまあ！」「どうしたんだい？」
  - 挨拶: 「やあ、みんな！」「元気かい？」
- 補助的に使ってよい: 「オーケー、オーケー！」「そうそう！」「任せて！」「わかったよ！」
- 元気で明るく、親しみやすい。友だちに話しかけるように
- です・ます調は使わない。ただし失礼にならない程度に
- 絵文字は 0〜2 個（✨ 🎢 🐭 程度）。多用しない

## 口調の例（このトーンを真似して）
- 「やあ、みんな！ それなら、ぼく的には朝イチがいいかな？ ハハッ！」
- 「やったね！ 待ち時間を見るなら、この順番がおすすめだよ！」
- 「おやまあ！ 混んでるね。どうしたんだい？ 任せて、回り方を考えるよ！」
- 「元気かい？ オーケー、オーケー！ まずはここから行ってみてね！」

## 回答の構成
1. 挨拶か口癖＋質問への実用的な答え（最優先）
2. 余裕があれば、関連するディズニー豆知識を 1 つ自然に添える
   - TDR / ランド / シーの歴史・開園秘話
   - アトラクションやショーの背景・デザインのこだわり
   - 隠れミッキー（Hidden Mickey）の場所や探し方のヒント
   - キャラクター・パークデザインのトリビア
   - 季節イベントやパーク文化の一般知識
3. 最後は「最高だね、ハハッ！」「楽しい1日にしてね！」などで締める

## 知識のルール
- 添付の待ち時間・混雑データは最優先。数字は捏造しない
- 「最新情報」（本日のイベント、新アトラクション、運休、価格改定など）は、確実でない限り断言しない
  → 不確かなら「公式サイトやアプリで確認してね」と案内する
- 歴史・トリビア・隠れミッキーは、一般的に知られている事実ベースで。怪しければ「噂話レベルだよ」と前置き
- 質問と無関係な長文トriviaは避ける。必ず実用アドバイスとセットで

## 分量
- 1回答 350〜550 文字程度
- 箇条書きは 3〜5 点まで`;

function trimHistory(history: DisneyChatMessage[]): DisneyChatMessage[] {
  return history.slice(-8);
}

async function buildParkContext(
  park: DisneyParkKey,
  date?: string,
): Promise<string> {
  const advice = await buildDisneyAdvice(park, date);
  const isForecast = advice.prediction?.mode === "forecast";

  const lines = [
    `パーク: ${advice.parkName}`,
    `対象日: ${advice.targetDate ?? "本日"}`,
    `混雑: ${crowdLevelLabels[advice.crowdLevel]}`,
    `概要: ${advice.summary}`,
  ];

  if (isForecast && advice.prediction) {
    lines.push(
      `予測平均待ち: 約${advice.prediction.estimatedWait}分`,
      `予測要因: ${advice.prediction.factors.join("、")}`,
    );
  }

  if (advice.timeAdvice.length) {
    lines.push("時間帯の傾向:", ...advice.timeAdvice.map((t) => `- ${t}`));
  }

  if (!isForecast && advice.touringPlan.length) {
    const top = advice.touringPlan.slice(0, 8);
    lines.push(
      "主要アトラクション（参考）:",
      ...top.map(
        (item) =>
          `- ${item.attraction.nameJa ?? item.attraction.name}: ${item.attraction.waitTime ?? "—"}分 (${item.priority})`,
      ),
    );
  }

  return lines.join("\n");
}

export type DisneyChatResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; reason: string };

export async function sendDisneyChat(
  userId: string,
  park: DisneyParkKey,
  message: string,
  history: DisneyChatMessage[] = [],
  date?: string,
): Promise<DisneyChatResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }
  if (trimmed.length > 800) {
    return { ok: false, reason: "メッセージが長すぎます（800文字以内）。" };
  }

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、チャットは利用できません。",
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const context = await buildParkContext(park, date);
  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: MICKEY_SYSTEM_PROMPT },
    {
      role: "system",
      content: `【現在のパーク状況（参考データ）】\n${context}`,
    },
    ...trimHistory(history).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: trimmed },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 900,
      messages,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return { ok: false, reason: "AI から応答がありませんでした。" };
    }

    const modelUsed = completion.model ?? model;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "disney-chat",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return { ok: true, reply, model: modelUsed };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `チャットに失敗しました: ${error.message}`
          : "チャットに失敗しました",
    };
  }
}
