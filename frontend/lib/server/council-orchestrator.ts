import OpenAI from "openai";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
  type AzureOpenAiResidency,
} from "@/lib/server/azure-openai";
import {
  formatAttachmentsForPrompt,
  normalizeAttachments,
} from "@/lib/server/council-attachments";
import { councilDepthConfig } from "@/lib/server/council-config";
import {
  formatModelDisplay,
  getCouncilConfigMeta,
  getCouncilDebaters,
  getCouncilJudge,
  type CouncilModelConfig,
} from "@/lib/server/council-models";
import { generateWithGemini } from "@/lib/server/gemini";
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

function isReasoningDeployment(deployment: string): boolean {
  return /gpt-5|gpt5|o1|o3|o4|reason/i.test(deployment);
}

function usesReasoningBudget(model: CouncilModelConfig, deployment: string): boolean {
  return Boolean(model.reasoningHeavy) || isReasoningDeployment(deployment);
}

function councilChatMessages(
  reasoning: boolean,
  systemPrompt: string,
  userPrompt: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  if (reasoning) {
    return [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }];
  }
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";

  const record = message as {
    content?: string | Array<{ type?: string; text?: string }> | null;
    refusal?: string | null;
  };
  const content = record.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const typed = part as { type?: string; text?: string };
          if (typed.type === "text" || typed.type === "output_text") return typed.text ?? "";
          return typed.text ?? "";
        }
        return "";
      })
      .join("")
      .trim();
  }

  const refusal = record.refusal;
  if (typeof refusal === "string" && refusal.trim()) return refusal.trim();

  return "";
}

function azureCompletionBudget(
  requested: number,
  reasoning: boolean,
  depth: CouncilDepth,
): number {
  const compact = depth === "compact";
  if (reasoning) {
    return Math.max(requested, compact ? 8000 : 12000);
  }
  return Math.max(requested, compact ? 720 : 1200);
}

async function createAzureCouncilCompletion(
  client: OpenAI,
  deployment: string,
  reasoning: boolean,
  depth: CouncilDepth,
  budget: number,
  systemPrompt: string,
  userPrompt: string,
) {
  const requestBody = {
    model: deployment,
    max_completion_tokens: budget,
    messages: councilChatMessages(reasoning, systemPrompt, userPrompt),
    ...(reasoning
      ? {
          reasoning_effort: depth === "compact" ? ("low" as "low" | "medium") : ("medium" as "low" | "medium"),
        }
      : {}),
  };

  try {
    return await client.chat.completions.create(requestBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (reasoning && /reasoning_effort|unknown|unsupported|invalid/i.test(message)) {
      const { reasoning_effort: _ignored, ...fallbackBody } = requestBody;
      return await client.chat.completions.create(fallbackBody);
    }
    throw error;
  }
}

async function callAzureCouncilModel(
  model: CouncilModelConfig,
  mode: CouncilMode,
  deployment: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  depth: CouncilDepth,
): Promise<ChatCompletionResult> {
  const residency: AzureOpenAiResidency = mode === "domestic" ? "domestic" : "global";
  const client = getAzureOpenAiClient(deployment, residency);
  const reasoning = usesReasoningBudget(model, deployment);

  let budget = azureCompletionBudget(maxTokens, reasoning, depth);
  let lastFinish: string | undefined;
  const maxAttempts = reasoning ? 4 : 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const completion = await createAzureCouncilCompletion(
      client,
      deployment,
      reasoning,
      depth,
      budget,
      systemPrompt,
      userPrompt,
    );
    const choice = completion.choices[0];
    lastFinish = choice?.finish_reason ?? undefined;
    const content = extractMessageText(choice?.message);
    if (content) {
      return {
        content,
        model: completion.model ?? deployment,
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        requestId: completion.id,
      };
    }
    if (lastFinish !== "length") break;
    budget = Math.min(Math.max(budget + 4000, budget * 2), 16384);
  }

  const fallbackDeployments = [
    process.env.AZURE_OPENAI_DEPLOYMENT_DEBATE_A,
    process.env.AZURE_OPENAI_DEPLOYMENT,
    getAzureOpenAiDeployment(),
  ].filter((dep): dep is string => Boolean(dep && dep !== deployment));
  const uniqueFallbacks = [...new Set(fallbackDeployments)];

  if (model.reasoningHeavy) {
    for (const fallbackDeployment of uniqueFallbacks) {
      const fallbackClient = getAzureOpenAiClient(fallbackDeployment, residency);
      const completion = await fallbackClient.chat.completions.create({
        model: fallbackDeployment,
        max_completion_tokens: Math.max(maxTokens, 900),
        messages: councilChatMessages(false, systemPrompt, userPrompt),
      });
      const content = extractMessageText(completion.choices[0]?.message);
      if (content) {
        console.warn(
          `[council] ${model.label}: latest deployment empty; used fallback ${fallbackDeployment}`,
        );
        return {
          content,
          model: completion.model ?? fallbackDeployment,
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
          requestId: completion.id,
        };
      }
    }
  }

  throw new Error(
    `Empty response from ${model.label}` +
      (lastFinish ? `（finish=${lastFinish}）` : "") +
      "。デプロイ名やトークン上限を確認してください。",
  );
}

async function callCouncilModel(
  model: CouncilModelConfig,
  mode: CouncilMode,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  depth: CouncilDepth,
): Promise<ChatCompletionResult> {
  if (mode === "domestic" && model.provider === "openai") {
    throw new Error("国内限定モードでは OpenAI 直 API は使用できません");
  }

  if (model.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: model.model ?? "gpt-5.6-sol",
      max_tokens: Math.max(maxTokens, 800),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const content = extractMessageText(completion.choices[0]?.message);
    if (!content) {
      throw new Error(
        `Empty response from ${model.label}` +
          (completion.choices[0]?.finish_reason
            ? `（finish=${completion.choices[0].finish_reason}）`
            : ""),
      );
    }
    return {
      content,
      model: completion.model ?? model.model ?? "openai",
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      requestId: completion.id,
    };
  }

  if (model.provider === "gemini") {
    const result = await generateWithGemini({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: Math.max(maxTokens, 800),
      temperature: 0.7,
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const content = result.text.trim();
    if (!content) throw new Error(`Empty response from ${model.label}`);
    return {
      content,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  const deployment = model.deployment!;
  return callAzureCouncilModel(
    model,
    mode,
    deployment,
    systemPrompt,
    userPrompt,
    maxTokens,
    depth,
  );
}

async function invokeCouncilDebater(
  userId: string,
  mode: CouncilMode,
  depth: CouncilDepth,
  phase: "initial" | "rebuttal",
  model: CouncilModelConfig,
  topicWithAttachments: string,
  prior?: CouncilModelOpinion[],
): Promise<CouncilModelOpinion> {
  const depthConfig = councilDepthConfig(depth);
  const priorText = prior?.length
    ? formatOpinionsForJudge(prior, depthConfig.judgeInputMaxChars)
    : "";

  const userPrompt =
    phase === "initial"
      ? `テーマ:\n${topicWithAttachments}\n要点だけ述べて。`
      : `テーマ:\n${topicWithAttachments}\n他AI:\n${priorText}\n1点だけ同意か反論を。`;

  const debaterPrompt = model.reasoningHeavy
    ? `${model.persona} 日本語。${depthConfig.debaterLengthHint}。長い思考は不要。`
    : `${model.persona}\n日本語。${depthConfig.debaterLengthHint}。`;

  const result = await callCouncilModel(
    model,
    mode,
    debaterPrompt,
    userPrompt,
    depthConfig.debaterMaxTokens,
    depth,
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
  };
}

type CouncilSessionContext = {
  trimmed: string;
  attachments: CouncilAttachment[];
  topicWithAttachments: string;
};

async function prepareCouncilSession(
  userId: string,
  topic: string,
  mode: CouncilMode,
  depth: CouncilDepth,
  attachmentsInput: unknown,
): Promise<{ ok: true; session: CouncilSessionContext } | { ok: false; reason: string }> {
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

  const configMeta = getCouncilConfigMeta();
  if (mode === "domestic" && !configMeta.domestic.available) {
    return {
      ok: false,
      reason:
        configMeta.domestic.warning ??
        "国内限定モードは日本リージョンの Azure OpenAI が必要です。",
    };
  }

  return {
    ok: true,
    session: {
      trimmed,
      attachments: attachmentResult.attachments,
      topicWithAttachments: buildTopicWithAttachments(trimmed, attachmentResult.attachments),
    },
  };
}

export type CouncilDebaterStepResult =
  | { ok: true; opinion: CouncilModelOpinion }
  | { ok: false; reason: string };

export async function runCouncilDebaterStep(
  userId: string,
  topic: string,
  mode: CouncilMode,
  depth: CouncilDepth,
  phase: "initial" | "rebuttal",
  modelId: string,
  attachmentsInput: unknown,
  priorInitial?: CouncilModelOpinion[],
): Promise<CouncilDebaterStepResult> {
  try {
    const prep = await prepareCouncilSession(userId, topic, mode, depth, attachmentsInput);
    if (!prep.ok) return prep;

    const debaters = getCouncilDebaters(mode, depth);
    const model = debaters.find((entry) => entry.id === modelId);
    if (!model) {
      return { ok: false, reason: `モデル ${modelId} はこの合議設定では利用できません。` };
    }

    const opinion = await invokeCouncilDebater(
      userId,
      mode,
      depth,
      phase,
      model,
      prep.session.topicWithAttachments,
      phase === "rebuttal" ? priorInitial : undefined,
    );

    return { ok: true, opinion };
  } catch (error) {
    console.error("[council] debater step failed", error);
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `AI 合議に失敗しました: ${error.message}`
          : "AI 合議に失敗しました",
    };
  }
}

export type CouncilJudgeStepResult =
  | {
      ok: true;
      synthesis: CouncilModelOpinion;
      judge: ReturnType<typeof getCouncilConfigMeta>["domestic"]["judge"];
      dataRegionNote: string;
    }
  | { ok: false; reason: string };

export async function runCouncilJudgeStep(
  userId: string,
  topic: string,
  mode: CouncilMode,
  depth: CouncilDepth,
  attachmentsInput: unknown,
  initial: CouncilModelOpinion[],
  rebuttal: CouncilModelOpinion[],
): Promise<CouncilJudgeStepResult> {
  try {
    const prep = await prepareCouncilSession(userId, topic, mode, depth, attachmentsInput);
    if (!prep.ok) return prep;

    if (!initial.length) {
      return { ok: false, reason: "議長のまとめには、少なくとも1件の意見が必要です。" };
    }

    const depthConfig = councilDepthConfig(depth);
    const judge = getCouncilJudge(mode);
    const configMeta = getCouncilConfigMeta();
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
      mode,
      `${judge.persona}\n日本語。${depthConfig.judgeLengthHint}。`,
      `テーマ:\n${prep.session.topicWithAttachments}\n\n意見:\n${opinionLines}\n\n結論をまとめて。`,
      depthConfig.judgeMaxTokens,
      depth,
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

    const judgeMeta = mode === "domestic" ? configMeta.domestic.judge : configMeta.global.judge;

    return {
      ok: true,
      synthesis,
      judge: judgeMeta,
      dataRegionNote:
        mode === "domestic"
          ? configMeta.domestic.dataRegion
          : configMeta.global.dataRegion,
    };
  } catch (error) {
    console.error("[council] judge step failed", error);
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `AI 合議に失敗しました: ${error.message}`
          : "AI 合議に失敗しました",
    };
  }
}

async function runModelPhase(
  userId: string,
  mode: CouncilMode,
  models: CouncilModelConfig[],
  phase: "initial" | "rebuttal",
  topicWithAttachments: string,
  depth: CouncilDepth,
  prior?: CouncilModelOpinion[],
): Promise<CouncilModelOpinion[]> {
  const invokeModel = async (model: CouncilModelConfig): Promise<CouncilModelOpinion> =>
    invokeCouncilDebater(
      userId,
      mode,
      depth,
      phase,
      model,
      topicWithAttachments,
      prior,
    );

  const settled =
    depth === "compact"
      ? await (async () => {
          const outcomes: PromiseSettledResult<CouncilModelOpinion>[] = [];
          for (const model of models) {
            try {
              outcomes.push({ status: "fulfilled", value: await invokeModel(model) });
            } catch (reason) {
              outcomes.push({ status: "rejected", reason });
            }
          }
          return outcomes;
        })()
      : await Promise.allSettled(models.map((model) => invokeModel(model)));

  const results: CouncilModelOpinion[] = [];
  const failures: string[] = [];
  for (let i = 0; i < settled.length; i += 1) {
    const item = settled[i]!;
    if (item.status === "fulfilled") {
      results.push(item.value);
      continue;
    }
    const label = models[i]?.label ?? `model-${i}`;
    const reason = item.reason instanceof Error ? item.reason.message : String(item.reason);
    failures.push(`${label}: ${reason}`);
    console.warn("[council]", phase, label, reason);
  }

  if (results.length === 0) {
    throw new Error(
      failures[0] ?? `Empty response from council ${phase} phase`,
    );
  }

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
  try {
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
    if (mode === "domestic" && !configMeta.domestic.available) {
      return {
        ok: false,
        reason:
          configMeta.domestic.warning ??
          "国内限定モードは日本リージョンの Azure OpenAI が必要です。",
      };
    }

    const topicWithAttachments = buildTopicWithAttachments(trimmed, attachments);

    const initial = await runModelPhase(
      userId,
      mode,
      debaters,
      "initial",
      topicWithAttachments,
      depth,
    );

    const rebuttal = depthConfig.includeRebuttal
      ? await runModelPhase(
          userId,
          mode,
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
      mode,
      `${judge.persona}\n日本語。${depthConfig.judgeLengthHint}。`,
      `テーマ:\n${topicWithAttachments}\n\n意見:\n${opinionLines}\n\n結論をまとめて。`,
      depthConfig.judgeMaxTokens,
      depth,
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
          role: m.role,
          displayName: formatModelDisplay(m),
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
    console.error("[council] runCouncilDebate failed", error);
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `AI 合議に失敗しました: ${error.message}`
          : "AI 合議に失敗しました",
    };
  }
}
