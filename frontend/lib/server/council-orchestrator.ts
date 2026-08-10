import OpenAI from "openai";
import {
  getAzureOpenAiClient,
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

function extractMessageText(message: {
  content?: string | Array<{ type?: string; text?: string }> | null;
  refusal?: string | null;
} | null | undefined): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("")
      .trim();
  }
  if (typeof message.refusal === "string" && message.refusal.trim()) {
    return message.refusal.trim();
  }
  return "";
}

function azureCompletionBudget(requested: number, deployment: string, depth: CouncilDepth): number {
  const name = deployment.toLowerCase();
  const compact = depth === "compact";
  if (/gpt-5|o1|o3|o4|reason/.test(name)) {
    return Math.max(requested, compact ? 900 : 1400);
  }
  return Math.max(requested, compact ? 500 : 700);
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
  const residency: AzureOpenAiResidency = mode === "domestic" ? "domestic" : "global";
  const client = getAzureOpenAiClient(deployment, residency);

  let budget = azureCompletionBudget(maxTokens, deployment, depth);
  let lastFinish: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: budget,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
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
    budget = Math.max(budget * 2, depth === "compact" ? 1600 : 2400);
  }

  throw new Error(
    `Empty response from ${model.label}` +
      (lastFinish ? `（finish=${lastFinish}）` : "") +
      "。デプロイ名やトークン上限を確認してください。",
  );
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
  const depthConfig = councilDepthConfig(depth);
  const priorText = prior?.length
    ? formatOpinionsForJudge(prior, depthConfig.judgeInputMaxChars)
    : "";

  const settled = await Promise.allSettled(
    models.map(async (model) => {
      const userPrompt =
        phase === "initial"
          ? `テーマ:\n${topicWithAttachments}\n要点だけ述べて。`
          : `テーマ:\n${topicWithAttachments}\n他AI:\n${priorText}\n1点だけ同意か反論を。`;

      const result = await callCouncilModel(
        model,
        mode,
        `${model.persona}\n日本語。${depthConfig.debaterLengthHint}。`,
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
      } satisfies CouncilModelOpinion;
    }),
  );

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

  try {
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
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `AI 合議に失敗しました: ${error.message}`
          : "AI 合議に失敗しました",
    };
  }
}
