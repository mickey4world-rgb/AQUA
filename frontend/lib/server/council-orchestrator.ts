import OpenAI from "openai";
import {
  getAzureOpenAiClient,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  formatAttachmentsForPrompt,
  normalizeAttachments,
} from "@/lib/server/council-attachments";
import { councilDepthConfig } from "@/lib/server/council-config";
import {
  getCouncilConfigMeta,
  getCouncilDebaters,
  getCouncilJudge,
  isOpenAiGlobalConfigured,
  type CouncilModelConfig,
} from "@/lib/server/council-models";
import { canUseAiTokens, recordTokenUsage } from "@/lib/server/token-usage";
import type {
  CouncilAttachment,
  CouncilDebateResult,
  CouncilDepth,
  CouncilMode,
  CouncilModelOpinion,
} from "@/lib/types/council";

type ChatCompletionResult = {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  requestId?: string;
};

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function formatOpinionsForJudge(
  opinions: CouncilModelOpinion[],
  maxCharsPerOpinion: number,
): string {
  return opinions
    .map((o) => `- ${o.modelLabel}: ${truncate(o.content, maxCharsPerOpinion)}`)
    .join("\n");
}

function buildTopicWithAttachments(topic: string, attachments: CouncilAttachment[]): string {
  const attachmentBlock = formatAttachmentsForPrompt(attachments);
  if (!attachmentBlock) return topic;
  return `${topic}\n\n${attachmentBlock}`;
}

async function callCouncilModel(
  model: CouncilModelConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<ChatCompletionResult> {
  if (model.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: model.model ?? "gpt-5.6-sol",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error(`Empty response from ${model.label}`);
    return {
      content,
      model: completion.model ?? model.model ?? "openai",
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      requestId: completion.id,
    };
  }

  const deployment = model.deployment!;
  const client = getAzureOpenAiClient(deployment);
  const completion = await client.chat.completions.create({
    model: deployment,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error(`Empty response from ${model.label}`);
  return {
    content,
    model: completion.model ?? deployment,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    requestId: completion.id,
  };
}

async function runModelPhase(
  userId: string,
  models: CouncilModelConfig[],
  phase: "initial" | "rebuttal",
  topicWithAttachments: string,
  depth: CouncilDepth,
  prior?: CouncilModelOpinion[],
): Promise<CouncilModelOpinion[]> {
  const depthConfig = councilDepthConfig(depth);
  const priorText = prior?.length
    ? formatOpinionsForJudge(prior, depthConfig.judgeInputMaxChars)
    : "";

  const results = await Promise.all(
    models.map(async (model) => {
      const userPrompt =
        phase === "initial"
          ? `テーマ:\n${topicWithAttachments}\n要点だけ述べて。`
          : `テーマ:\n${topicWithAttachments}\n他AI:\n${priorText}\n1点だけ同意か反論を。`;

      const result = await callCouncilModel(
        model,
        `${model.persona}\n日本語。${depthConfig.debaterLengthHint}。`,
        userPrompt,
        depthConfig.debaterMaxTokens,
      );

      await recordTokenUsage({
        userId,
        feature: `council-${phase}-${model.featureSuffix}`,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        requestId: result.requestId,
      });

      return {
        modelId: model.id,
        modelLabel: model.label,
        phase,
        content: result.content,
        modelUsed: result.model,
        provider: model.provider,
      } satisfies CouncilModelOpinion;
    }),
  );

  return results;
}

export type CouncilDebateRunResult =
  | { ok: true; result: CouncilDebateResult }
  | { ok: false; reason: string };

export async function runCouncilDebate(
  userId: string,
  topic: string,
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
  attachmentsInput: unknown = null,
): Promise<CouncilDebateRunResult> {
  const trimmed = topic.trim();
  const depthConfig = councilDepthConfig(depth);

  if (!trimmed) {
    return { ok: false, reason: "相談内容を入力してください。" };
  }
  if (trimmed.length > depthConfig.topicMaxLength) {
    return {
      ok: false,
      reason: `相談内容が長すぎます（${depthConfig.topicMaxLength}文字以内）。`,
    };
  }

  const attachmentResult = normalizeAttachments(attachmentsInput);
  if (!attachmentResult.ok) {
    return { ok: false, reason: attachmentResult.reason };
  }
  const attachments = attachmentResult.attachments;

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、AI 合議は利用できません。",
    };
  }

  if (mode === "global" && !isOpenAiGlobalConfigured()) {
    return {
      ok: false,
      reason:
        "国内問わずモードには OPENAI_API_KEY の設定が必要です。Azure Portal → SWA → Configuration で追加してください。",
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const debaters = getCouncilDebaters(mode, depth);
  if (!debaters.length) {
    return { ok: false, reason: "利用可能な AI モデルがありません。" };
  }

  const judge = getCouncilJudge(mode);
  const configMeta = getCouncilConfigMeta();
  const topicWithAttachments = buildTopicWithAttachments(trimmed, attachments);

  try {
    const initial = await runModelPhase(
      userId,
      debaters,
      "initial",
      topicWithAttachments,
      depth,
    );

    const rebuttal = depthConfig.includeRebuttal
      ? await runModelPhase(
          userId,
          debaters,
          "rebuttal",
          topicWithAttachments,
          depth,
          initial,
        )
      : [];

    const opinionLines = [
      formatOpinionsForJudge(initial, depthConfig.judgeInputMaxChars),
      rebuttal.length
        ? formatOpinionsForJudge(rebuttal, depthConfig.judgeInputMaxChars)
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const judgeResult = await callCouncilModel(
      judge,
      `${judge.persona}\n日本語。${depthConfig.judgeLengthHint}。`,
      `テーマ:\n${topicWithAttachments}\n\n意見:\n${opinionLines}\n\n結論をまとめて。`,
      depthConfig.judgeMaxTokens,
    );

    await recordTokenUsage({
      userId,
      feature: `council-synthesis-${judge.featureSuffix}`,
      model: judgeResult.model,
      promptTokens: judgeResult.promptTokens,
      completionTokens: judgeResult.completionTokens,
      requestId: judgeResult.requestId,
    });

    const synthesis: CouncilModelOpinion = {
      modelId: judge.id,
      modelLabel: judge.label,
      phase: "synthesis",
      content: judgeResult.content,
      modelUsed: judgeResult.model,
      provider: judge.provider,
    };

    const apiCalls =
      debaters.length + (depthConfig.includeRebuttal ? debaters.length : 0) + 1;

    const judgeMeta = mode === "domestic" ? configMeta.domestic.judge : configMeta.global.judge;

    return {
      ok: true,
      result: {
        mode,
        depth,
        topic: trimmed,
        attachments,
        models: debaters.map((m) => ({
          id: m.id,
          label: m.label,
          provider: m.provider,
          deployment: m.deployment,
          model: m.model,
          displayName:
            m.provider === "openai"
              ? `OpenAI · ${m.model}`
              : `Azure · ${m.deployment}`,
        })),
        judge: judgeMeta,
        initial,
        rebuttal,
        synthesis,
        dataRegionNote:
          mode === "domestic"
            ? configMeta.domestic.dataRegion
            : configMeta.global.dataRegion,
        apiCalls,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `AI 合議に失敗しました: ${error.message}`
          : "AI 合議に失敗しました",
    };
  }
}
