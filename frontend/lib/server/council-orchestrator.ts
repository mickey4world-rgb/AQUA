import OpenAI from "openai";
import {
  getAzureOpenAiClient,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  getCouncilConfigMeta,
  getCouncilDebaters,
  getCouncilJudge,
  type CouncilModelConfig,
} from "@/lib/server/council-models";
import { canUseAiTokens, recordTokenUsage } from "@/lib/server/token-usage";
import type {
  CouncilDebateResult,
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

function formatOpinions(opinions: CouncilModelOpinion[]): string {
  return opinions
    .map((o) => `【${o.modelLabel}】\n${o.content}`)
    .join("\n\n---\n\n");
}

async function callCouncilModel(
  model: CouncilModelConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<ChatCompletionResult> {
  if (model.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: model.model ?? "gpt-4o",
      max_tokens: model.maxTokens,
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
    max_completion_tokens: model.maxTokens,
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
  topic: string,
  prior?: CouncilModelOpinion[],
): Promise<CouncilModelOpinion[]> {
  const priorText = prior?.length ? formatOpinions(prior) : "";

  const results = await Promise.all(
    models.map(async (model) => {
      const userPrompt =
        phase === "initial"
          ? `相談テーマ:\n${topic}\n\n最初の意見を述べてください。`
          : `相談テーマ:\n${topic}\n\n他の AI の意見:\n${priorText}\n\n上記を踏まえ、同意・反論・補足を述べてください。`;

      const result = await callCouncilModel(
        model,
        `${model.persona}\n\n回答は日本語。300〜500文字程度。`,
        userPrompt,
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
): Promise<CouncilDebateRunResult> {
  const trimmed = topic.trim();
  if (!trimmed) {
    return { ok: false, reason: "相談内容を入力してください。" };
  }
  if (trimmed.length > 1200) {
    return { ok: false, reason: "相談内容が長すぎます（1200文字以内）。" };
  }

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、AI 合議は利用できません。",
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const debaters = getCouncilDebaters(mode);
  const judge = getCouncilJudge(mode);
  const configMeta = getCouncilConfigMeta();

  try {
    const initial = await runModelPhase(userId, debaters, "initial", trimmed);
    const rebuttal = await runModelPhase(userId, debaters, "rebuttal", trimmed, initial);

    const debateLog = [
      "=== 第1ラウンド（初見） ===",
      formatOpinions(initial),
      "",
      "=== 第2ラウンド（議論） ===",
      formatOpinions(rebuttal),
    ].join("\n");

    const judgeResult = await callCouncilModel(
      judge,
      `${judge.persona}\n\n回答は日本語。400〜700文字。箇条書き可。`,
      `相談テーマ:\n${trimmed}\n\n以下は AI 合議の記録です。対立点・合意点を整理し、最終回答をまとめてください。\n\n${debateLog}`,
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
    };

    return {
      ok: true,
      result: {
        mode,
        topic: trimmed,
        models: debaters.map((m) => ({
          id: m.id,
          label: m.label,
          provider: m.provider,
          deployment: m.deployment,
          model: m.model,
        })),
        initial,
        rebuttal,
        synthesis,
        dataRegionNote:
          mode === "domestic"
            ? configMeta.domestic.dataRegion
            : configMeta.global.dataRegion,
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
