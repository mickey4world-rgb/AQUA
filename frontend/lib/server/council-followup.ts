import OpenAI from "openai";
import {
  getAzureOpenAiClient,
  isAzureOpenAiConfigured,
  type AzureOpenAiResidency,
} from "@/lib/server/azure-openai";
import { formatAttachmentsForPrompt } from "@/lib/server/council-attachments";
import { getCouncilConfigMeta, getCouncilJudge } from "@/lib/server/council-models";
import { canUseAiTokens, recordTokenUsage } from "@/lib/server/token-usage";
import type {
  CouncilAttachment,
  CouncilChatMessage,
  CouncilDebateResult,
  CouncilMode,
} from "@/lib/types/council";

const MAX_HISTORY = 8;
const MAX_MESSAGE = 800;

export type CouncilFollowUpResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; reason: string };

function trimHistory(history: CouncilChatMessage[]): CouncilChatMessage[] {
  return history.slice(-MAX_HISTORY);
}

async function callFollowUpModel(
  mode: CouncilMode,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<{ content: string; model: string; usage: { prompt: number; completion: number }; requestId?: string }> {
  const judge = getCouncilJudge(mode);

  if (mode === "domestic" && judge.provider === "openai") {
    throw new Error("国内限定モードでは OpenAI 直 API は使用できません");
  }

  if (judge.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: judge.model ?? "gpt-5.6-sol",
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty follow-up response");
    return {
      content,
      model: completion.model ?? judge.model ?? "openai",
      usage: {
        prompt: completion.usage?.prompt_tokens ?? 0,
        completion: completion.usage?.completion_tokens ?? 0,
      },
      requestId: completion.id,
    };
  }

  const deployment = judge.deployment!;
  const residency: AzureOpenAiResidency = mode === "domestic" ? "domestic" : "global";
  const client = getAzureOpenAiClient(deployment, residency);
  const completion = await client.chat.completions.create({
    model: deployment,
    max_completion_tokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty follow-up response");
  return {
    content,
    model: completion.model ?? deployment,
    usage: {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0,
    },
    requestId: completion.id,
  };
}

export async function sendCouncilFollowUp(
  userId: string,
  message: string,
  debate: CouncilDebateResult,
  history: CouncilChatMessage[],
  attachments: CouncilAttachment[] = [],
): Promise<CouncilFollowUpResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }
  if (trimmed.length > MAX_MESSAGE) {
    return { ok: false, reason: `メッセージが長すぎます（${MAX_MESSAGE} 文字以内）。` };
  }

  if (!isAzureOpenAiConfigured()) {
    return { ok: false, reason: "Azure OpenAI が未設定のため、チャットは利用できません。" };
  }

  if (debate.mode === "domestic") {
    const configMeta = getCouncilConfigMeta();
    if (!configMeta.domestic.available) {
      return {
        ok: false,
        reason:
          configMeta.domestic.warning ??
          "国内限定モードは日本リージョンの Azure OpenAI が必要です。",
      };
    }
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const attachmentBlock = formatAttachmentsForPrompt(attachments);
  const systemPrompt = [
    "あなたは AI 合議の議長。先の合議結果を踏まえ、追加質問に簡潔に答える。",
    "日本語。150〜280文字程度。",
    "",
    `【元テーマ】${debate.topic}`,
    `【合議まとめ】${debate.synthesis.content}`,
    debate.synthesis.modelUsed ? `（議長モデル: ${debate.synthesis.modelUsed}）` : "",
    attachmentBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const prior = trimHistory(history);
  const messages = [
    ...prior.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: trimmed },
  ];

  try {
    const result = await callFollowUpModel(debate.mode, systemPrompt, messages);

    await recordTokenUsage({
      userId,
      feature: "council-followup",
      model: result.model,
      promptTokens: result.usage.prompt,
      completionTokens: result.usage.completion,
      requestId: result.requestId,
    });

    return { ok: true, reply: result.content, model: result.model };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `フォローアップに失敗しました: ${error.message}`
          : "フォローアップに失敗しました",
    };
  }
}
