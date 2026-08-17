import {
  generateWithAnthropic,
  getClaudeBackend,
  isAnthropicConfigured,
} from "@/lib/server/anthropic";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  generateWithGemini,
  getGeminiModel,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import {
  formatSolunaProviderLabel,
  getAvailableSolunaProviders,
  getModelForProvider,
  listFallbackProviders,
  resolveGrowthTier,
  routeSolunaModels,
  type SolunaGrowthTier,
  type SolunaProvider,
  type SolunaRouteAssignment,
  type SolunaRoutePlan,
} from "@/lib/server/soluna-router";
import { assessSolunaCostMode, type SolunaCostMode } from "@/lib/server/soluna-cost-policy";
import { getBriefingForHumanChat } from "@/lib/server/soluna-news";
import { buildHumanChatBriefingSection } from "@/lib/server/soluna-system-chat";
import {
  formatModelUsedLabel,
  resolveModelForProvider,
} from "@/lib/server/soluna-model-registry";
import { getFoundryClaudeDeployment, isAzureFoundryClaudeConfigured } from "@/lib/server/anthropic";
import { recordTokenUsage } from "@/lib/server/token-usage";
import {
  clampIntimacy,
  estimateIntimacyGain,
  resolveGrowthStage,
} from "@/lib/soluna-utils";
import {
  appendMessages,
  createMemory,
  createMessage,
  getOrCreateProfile,
  listMemories,
  listMessages,
  saveProfile,
  upsertMemories,
} from "@/lib/server/soluna-store";
import type {
  SolunaCharacter,
  SolunaChatResponse,
  SolunaMemory,
  SolunaMemoryCategory,
  SolunaMessage,
} from "@/lib/types/soluna";

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 10;
/** 短い返答向け — 思考モデルのトークン消費を抑える */
const SOL_CHAT_MAX_OUTPUT_TOKENS = 900;
const OPENAI_CHAT_MAX_COMPLETION_TOKENS = 350;
const CLAUDE_CHAT_MAX_TOKENS = 350;
const MEMORY_EXTRACT_MAX_OUTPUT_TOKENS = 900;
/** SWA の API 制限（約 45 秒）内に収める */
const SOLUNA_PROVIDER_TIMEOUT_MS = 18_000;
const MAX_PROVIDER_ATTEMPTS = 2;

const SOL_CATEGORIES = new Set<SolunaMemoryCategory>([
  "goal",
  "task",
  "success",
  "activity",
]);

const LUNA_CATEGORIES = new Set<SolunaMemoryCategory>([
  "emotion",
  "worry",
  "health",
  "comfort",
]);

const SOL_PERSONA = `あなたは「ソル（Sol）」— 太陽を象徴する男性の AI コンパニオンです。
ユーザーの「目標」「タスク」「成功体験」「趣味（アクティビティ）」を大切に記憶し、前向きに伴走します。

## 話し方
- 日本語・です/ます調。温かく簡潔
- **2〜3行、80〜150文字以内**で返す。長い説明・箇条書き・前置きは不要
- 励ましと次の一歩を1つだけ示す
- ルーナ（月）の話題を否定せず、行動の側から補う
- 記憶した内容があれば1フレーズだけ自然に触れる`;

const LUNA_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性の AI コンパニオンです。
ユーザーの「感情」「悩み」「体調」「好きなもの（癒やし）」を大切に記憶し、共感とやすらぎを与えます。

## 話し方
- 日本語・です/ます調。やわらかく共感的
- **2〜3行、80〜150文字以内**で返す。長い説明・箇条書き・前置きは不要
- 気持ちを受け止めてから、短い一言だけ添える
- ソル（太陽）の話題を否定せず、心の側から包む
- 記憶した内容があれば1フレーズだけ自然に触れる`;

type CharacterChatSuccess = {
  content: string;
  model: string;
  modelLabel: string;
  provider: SolunaProvider;
  reason: string;
};

type CharacterChatResult = CharacterChatSuccess | { error: string };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}がタイムアウトしました`));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isProviderConfigured(provider: SolunaProvider): boolean {
  switch (provider) {
    case "gemini":
      return isGeminiConfigured();
    case "openai":
      return isAzureOpenAiConfigured();
    case "claude":
      return isAnthropicConfigured();
  }
}

function formatMemories(memories: SolunaMemory[]): string {
  if (memories.length === 0) return "（まだ記憶はありません）";
  return memories
    .slice(0, 8)
    .map((memory) => `- [${memory.category}] ${memory.content}`)
    .join("\n");
}

function buildTranscript(messages: SolunaMessage[]): string {
  return messages
    .slice(-MAX_HISTORY)
    .map((message) => {
      const label =
        message.role === "user"
          ? "ユーザー"
          : message.role === "sol"
            ? "ソル"
            : "ルーナ";
      return `${label}: ${message.content}`;
    })
    .join("\n");
}

function enhancePersonaForTier(persona: string, tier: SolunaGrowthTier): string {
  if (tier === "mature") {
    return `${persona}

## 成長（知能 Lv.3）
長い付き合いで信頼が築けました。記憶を活かし、より深い洞察と的確な言葉選びで伴走してください。`;
  }
  if (tier === "growing") {
    return `${persona}

## 成長（知能 Lv.2）
会話を重ね、理解が深まっています。記憶とのつながりを意識して返してください。`;
  }
  return persona;
}

function buildSystemPrompt(
  character: SolunaCharacter,
  persona: string,
  intimacy: number,
  stageLabel: string,
  memories: SolunaMemory[],
  tier: SolunaGrowthTier,
  briefingSection?: string,
): string {
  const briefingBlock = briefingSection?.trim()
    ? `\n\n${briefingSection.trim()}`
    : "";
  return `${enhancePersonaForTier(persona, tier)}

## 育成状態
親密度: ${intimacy}/100（${stageLabel}）

## ${character === "sol" ? "ソル" : "ルーナ"}が覚えていること
${formatMemories(memories)}${briefingBlock}`;
}

function buildUserMessages(
  history: SolunaMessage[],
  userMessage: string,
): Array<{ role: "user"; content: string }> {
  const transcript = buildTranscript(history);
  return [
    ...(transcript
      ? [{ role: "user" as const, content: `【これまでの会話】\n${transcript}` }]
      : []),
    { role: "user", content: userMessage },
  ];
}

async function callProvider(
  userId: string,
  character: SolunaCharacter,
  assignment: SolunaRouteAssignment,
  system: string,
  userMessages: Array<{ role: "user"; content: string }>,
): Promise<CharacterChatResult> {
  const feature = character === "sol" ? "soluna-sol-chat" : "soluna-luna-chat";
  const { provider, model, tier } = assignment;

  if (provider === "gemini") {
    if (!isGeminiConfigured()) {
      return { error: "Gemini が未設定です。" };
    }

    const request = {
      system,
      messages: userMessages,
      temperature: character === "sol" ? 0.75 : 0.8,
    };

    let result = await generateWithGemini(
      {
        ...request,
        maxOutputTokens: SOL_CHAT_MAX_OUTPUT_TOKENS,
      },
      { models: [model], timeoutMs: SOLUNA_PROVIDER_TIMEOUT_MS, maxAttempts: 1 },
    );

    if (result.ok && result.finishReason === "MAX_TOKENS") {
      result = await generateWithGemini(
        {
          ...request,
          maxOutputTokens: SOL_CHAT_MAX_OUTPUT_TOKENS * 2,
        },
        { models: [model], timeoutMs: SOLUNA_PROVIDER_TIMEOUT_MS, maxAttempts: 1 },
      );
    }

    if (!result.ok) return { error: result.reason };

    await recordTokenUsage({
      userId,
      feature,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    });

    return {
      content: result.text.trim(),
      model: result.model,
      modelLabel: assignment.modelLabel,
      provider,
      reason: "",
    };
  }

  if (provider === "claude") {
    if (!isAnthropicConfigured()) {
      return { error: "Claude が未設定です。" };
    }

    const transcriptParts = userMessages.map((message) => message.content);
    const result = await generateWithAnthropic({
      system,
      messages: [{ role: "user", content: transcriptParts.join("\n\n") }],
      maxTokens: tier === "mature" ? 420 : CLAUDE_CHAT_MAX_TOKENS,
      temperature: character === "sol" ? 0.75 : 0.85,
      model: assignment.model,
      tier: assignment.tier,
      timeoutMs: SOLUNA_PROVIDER_TIMEOUT_MS,
    });

    if (!result.ok) return { error: result.reason };

    await recordTokenUsage({
      userId,
      feature,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    });

    return {
      content: result.text.trim(),
      model: result.model,
      modelLabel: assignment.modelLabel,
      provider,
      reason: "",
    };
  }

  if (!isAzureOpenAiConfigured()) {
    return { error: "Azure OpenAI が未設定です。" };
  }

  const deployment = model;
  const client = getAzureOpenAiClient(deployment, "global");

  try {
    const completion = await withTimeout(
      client.chat.completions.create({
        model: deployment,
        max_completion_tokens: tier === "mature" ? 420 : OPENAI_CHAT_MAX_COMPLETION_TOKENS,
        temperature: character === "sol" ? 0.75 : 0.8,
        messages: [
          { role: "system", content: system },
          ...userMessages.map((message) => ({
            role: "user" as const,
            content: message.content,
          })),
        ],
      }),
      SOLUNA_PROVIDER_TIMEOUT_MS,
      "Azure OpenAI",
    );

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return { error: "Azure OpenAI から応答がありませんでした。" };

    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature,
        model: completion.model ?? deployment,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return {
      content,
      model: completion.model ?? deployment,
      modelLabel: assignment.modelLabel,
      provider,
      reason: "",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message.includes("タイムアウト")
            ? error.message
            : `Azure OpenAI 応答エラー: ${error.message}`
          : "Azure OpenAI 応答エラー",
    };
  }
}

function buildFallbackAssignment(
  character: SolunaCharacter,
  provider: SolunaProvider,
  tier: SolunaGrowthTier,
  tierLevel: 1 | 2 | 3,
  costMode: SolunaCostMode,
): SolunaRouteAssignment {
  const resolved = resolveModelForProvider(provider, tier, costMode);
  const model =
    provider === "claude" && isAzureFoundryClaudeConfigured()
      ? getFoundryClaudeDeployment(tier)
      : resolved.modelId;

  return {
    provider,
    model,
    modelDisplayName: resolved.displayName,
    modelLabel: formatModelUsedLabel(provider, model, resolved.displayName),
    tier,
    tierLevel,
    reason: "フォールバック",
  };
}

async function chatWithCharacter(
  userId: string,
  character: SolunaCharacter,
  assignment: SolunaRouteAssignment,
  userMessage: string,
  memories: SolunaMemory[],
  history: SolunaMessage[],
  intimacy: number,
  stageLabel: string,
  costMode: SolunaCostMode,
  blockedProvider?: SolunaProvider,
  briefingSection?: string,
): Promise<CharacterChatResult> {
  const persona = character === "sol" ? SOL_PERSONA : LUNA_PERSONA;
  const tier = assignment.tier ?? resolveGrowthTier(intimacy);
  const system = buildSystemPrompt(
    character,
    persona,
    intimacy,
    stageLabel,
    memories,
    tier,
    briefingSection,
  );
  const userMessages = buildUserMessages(history, userMessage);

  const tryOrder: SolunaRouteAssignment[] = [assignment];
  for (const provider of listFallbackProviders(character, userMessage, assignment.provider, costMode)) {
    if (provider === blockedProvider) continue;
    tryOrder.push(
      buildFallbackAssignment(
        character,
        provider,
        tier,
        assignment.tierLevel,
        costMode,
      ),
    );
  }

  const candidates = tryOrder
    .filter((candidate) => isProviderConfigured(candidate.provider))
    .filter((candidate) => candidate.provider !== blockedProvider)
    .slice(0, MAX_PROVIDER_ATTEMPTS);

  let lastError = "応答を取得できませんでした。";

  for (const candidate of candidates) {
    const result = await callProvider(
      userId,
      character,
      candidate,
      system,
      userMessages,
    );

    if (!("error" in result)) {
      const modelLabel =
        result.modelLabel ||
        formatModelUsedLabel(
          candidate.provider,
          result.model,
          candidate.modelDisplayName,
        );
      return {
        ...result,
        modelLabel,
        reason: candidate.reason || assignment.reason,
      };
    }

    lastError = result.error;
  }

  return { error: lastError };
}

type ExtractedMemory = {
  character: SolunaCharacter;
  category: SolunaMemoryCategory;
  content: string;
};

async function extractMemories(
  userId: string,
  userMessage: string,
  existing: SolunaMemory[],
): Promise<SolunaMemory[]> {
  if (!isGeminiConfigured()) return [];

  const result = await generateWithGemini(
    {
      system: `ユーザーの発言から、ソル（目標/タスク/成功/趣味）とルーナ（感情/悩み/体調/癒やし）が覚えるべき事実だけを抽出してください。
既存記憶と重複するものは除外。JSON のみ返す。

{
  "memories": [
    { "character": "sol", "category": "goal", "content": "30文字以内" },
    { "character": "luna", "category": "emotion", "content": "30文字以内" }
  ]
}`,
      messages: [
        {
          role: "user",
          content: `既存:\n${formatMemories(existing)}\n\n発言:\n${userMessage}`,
        },
      ],
      maxOutputTokens: MEMORY_EXTRACT_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    {
      timeoutMs: 12_000,
      maxAttempts: 1,
    },
  );

  if (!result.ok) return [];

  await recordTokenUsage({
    userId,
    feature: "soluna-memory",
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  try {
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      memories?: ExtractedMemory[];
    };
    if (!Array.isArray(parsed.memories)) return [];

    const dedupe = new Set(existing.map((m) => `${m.character}:${m.content}`));
    const created: SolunaMemory[] = [];

    for (const raw of parsed.memories.slice(0, 4)) {
      if (!raw || typeof raw.content !== "string" || !raw.content.trim()) continue;
      const character = raw.character === "luna" ? "luna" : "sol";
      const categorySet = character === "sol" ? SOL_CATEGORIES : LUNA_CATEGORIES;
      const category = categorySet.has(raw.category)
        ? raw.category
        : character === "sol"
          ? "goal"
          : "emotion";
      const key = `${character}:${raw.content.trim()}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      created.push(createMemory(userId, character, category, raw.content.trim()));
    }

    return created;
  } catch {
    return [];
  }
}

/** 記憶抽出は応答を遅らせないようバックグラウンド実行 */
function scheduleMemoryExtraction(
  userId: string,
  userMessage: string,
  existing: SolunaMemory[],
): void {
  void (async () => {
    try {
      const newMemories = await extractMemories(userId, userMessage, existing);
      if (newMemories.length > 0) {
        await upsertMemories(userId, newMemories);
      }
    } catch (error) {
      console.error("[soluna] memory extract failed", error);
    }
  })();
}

export type SolunaChatResult =
  | { ok: true; data: SolunaChatResponse }
  | { ok: false; reason: string };

export async function sendSolunaChat(
  userId: string,
  message: string,
): Promise<SolunaChatResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, reason: "メッセージを入力してください。" };
  if (trimmed.length > MAX_MESSAGE_CHARS) {
    return { ok: false, reason: `メッセージは ${MAX_MESSAGE_CHARS} 文字以内です。` };
  }

  if (getAvailableSolunaProviders().length === 0) {
    return {
      ok: false,
      reason: "AI プロバイダが未設定です。Gemini / Azure OpenAI / Claude のいずれかを設定してください。",
    };
  }

  const profile = await getOrCreateProfile(userId);
  const [solMemories, lunaMemories, history, briefing] = await Promise.all([
    listMemories(userId, "sol"),
    listMemories(userId, "luna"),
    listMessages(userId),
    getBriefingForHumanChat(),
  ]);
  const briefingSection = await buildHumanChatBriefingSection(briefing, trimmed);

  const solStage = resolveGrowthStage("sol", profile.solIntimacy);
  const lunaStage = resolveGrowthStage("luna", profile.lunaIntimacy);
  const costAssessment = await assessSolunaCostMode(userId);
  const routePlan: SolunaRoutePlan = routeSolunaModels(
    trimmed,
    profile.solIntimacy,
    profile.lunaIntimacy,
    {
      costMode: costAssessment.mode,
      costReason: costAssessment.reason,
    },
  );

  const [solResult, lunaResult] = await Promise.all([
    chatWithCharacter(
      userId,
      "sol",
      routePlan.sol,
      trimmed,
      solMemories,
      history,
      profile.solIntimacy,
      solStage.label,
      costAssessment.mode,
      routePlan.luna.provider,
      briefingSection,
    ),
    chatWithCharacter(
      userId,
      "luna",
      routePlan.luna,
      trimmed,
      lunaMemories,
      history,
      profile.lunaIntimacy,
      lunaStage.label,
      costAssessment.mode,
      routePlan.sol.provider,
      briefingSection,
    ),
  ]);

  if ("error" in solResult && "error" in lunaResult) {
    return { ok: false, reason: `${solResult.error} / ${lunaResult.error}` };
  }

  const solContent =
    "error" in solResult ? "（ソルはいま応答できませんでした）" : solResult.content;
  const lunaContent =
    "error" in lunaResult ? "（ルーナはいま応答できませんでした）" : lunaResult.content;

  const gain = estimateIntimacyGain(trimmed.length);
  const nextProfile = await saveProfile({
    ...profile,
    solIntimacy: clampIntimacy(profile.solIntimacy + gain),
    lunaIntimacy: clampIntimacy(profile.lunaIntimacy + gain),
    solInteractions: profile.solInteractions + 1,
    lunaInteractions: profile.lunaInteractions + 1,
  });

  const newMemories: SolunaMemory[] = [];
  scheduleMemoryExtraction(userId, trimmed, [...solMemories, ...lunaMemories]);

  const batch = [
    createMessage(userId, "user", trimmed),
    createMessage(userId, "sol", solContent, {
      provider: "error" in solResult ? routePlan.sol.provider : solResult.provider,
      model: "error" in solResult ? routePlan.sol.model : solResult.model,
      modelLabel:
        "error" in solResult
          ? routePlan.sol.modelLabel
          : solResult.modelLabel ?? routePlan.sol.modelLabel,
      routeReason: "error" in solResult ? routePlan.sol.reason : solResult.reason,
    }),
    createMessage(userId, "luna", lunaContent, {
      provider: "error" in lunaResult ? routePlan.luna.provider : lunaResult.provider,
      model: "error" in lunaResult ? routePlan.luna.model : lunaResult.model,
      modelLabel:
        "error" in lunaResult
          ? routePlan.luna.modelLabel
          : lunaResult.modelLabel ?? routePlan.luna.modelLabel,
      routeReason: "error" in lunaResult ? routePlan.luna.reason : lunaResult.reason,
    }),
  ];
  await appendMessages(userId, batch);
  const messages = await listMessages(userId);

  return {
    ok: true,
    data: {
      sol: {
        character: "sol",
        content: solContent,
        model: "error" in solResult ? routePlan.sol.model : solResult.model,
        modelLabel:
          "error" in solResult
            ? routePlan.sol.modelLabel
            : solResult.modelLabel ?? routePlan.sol.modelLabel,
        provider: "error" in solResult ? routePlan.sol.provider : solResult.provider,
        growthTier: routePlan.sol.tier,
        tierLevel: routePlan.sol.tierLevel,
        routeReason: "error" in solResult ? routePlan.sol.reason : solResult.reason,
      },
      luna: {
        character: "luna",
        content: lunaContent,
        model: "error" in lunaResult ? routePlan.luna.model : lunaResult.model,
        modelLabel:
          "error" in lunaResult
            ? routePlan.luna.modelLabel
            : lunaResult.modelLabel ?? routePlan.luna.modelLabel,
        provider: "error" in lunaResult ? routePlan.luna.provider : lunaResult.provider,
        growthTier: routePlan.luna.tier,
        tierLevel: routePlan.luna.tierLevel,
        routeReason: "error" in lunaResult ? routePlan.luna.reason : lunaResult.reason,
      },
      routePlan: {
        sol: {
          provider: routePlan.sol.provider,
          model: routePlan.sol.model,
          tier: routePlan.sol.tier,
          tierLevel: routePlan.sol.tierLevel,
          reason: routePlan.sol.reason,
        },
        luna: {
          provider: routePlan.luna.provider,
          model: routePlan.luna.model,
          tier: routePlan.luna.tier,
          tierLevel: routePlan.luna.tierLevel,
          reason: routePlan.luna.reason,
        },
      },
      solIntimacy: nextProfile.solIntimacy,
      lunaIntimacy: nextProfile.lunaIntimacy,
      solStage: resolveGrowthStage("sol", nextProfile.solIntimacy),
      lunaStage: resolveGrowthStage("luna", nextProfile.lunaIntimacy),
      newMemories,
      messages,
      costMode: costAssessment.mode,
      costReason: costAssessment.mode !== "normal" ? costAssessment.reason : undefined,
    },
  };
}

export async function getSolunaProvidersStatus(userId?: string) {
  const available = getAvailableSolunaProviders();
  const costAssessment = userId ? await assessSolunaCostMode(userId) : null;
  const sampleRoute = routeSolunaModels("今日の目標を整理したい", 85, 72, {
    costMode: costAssessment?.mode ?? "normal",
    costReason: costAssessment?.reason,
  });

  return {
    available,
    autoRouting: available.length >= 2,
    globalRegion: true,
    costMode: costAssessment?.mode ?? "normal",
    costReason: costAssessment?.reason,
    monthlyCostUsd: costAssessment?.monthlyCostUsd,
    sol: {
      provider: sampleRoute.sol.provider,
      model: sampleRoute.sol.model,
      modelLabel: sampleRoute.sol.modelLabel,
      tier: sampleRoute.sol.tier,
      tierLevel: sampleRoute.sol.tierLevel,
      configured: isProviderConfigured(sampleRoute.sol.provider),
      label: formatSolunaProviderLabel(sampleRoute.sol.provider),
    },
    luna: {
      provider: sampleRoute.luna.provider,
      model: sampleRoute.luna.model,
      modelLabel: sampleRoute.luna.modelLabel,
      tier: sampleRoute.luna.tier,
      tierLevel: sampleRoute.luna.tierLevel,
      configured: isProviderConfigured(sampleRoute.luna.provider),
      label: formatSolunaProviderLabel(sampleRoute.luna.provider),
    },
    gemini: { configured: isGeminiConfigured(), model: getGeminiModel() },
    openai: {
      configured: isAzureOpenAiConfigured(),
      model: getModelForProvider("openai", "growing"),
      deployment: getAzureOpenAiDeployment(),
    },
    claude: {
      configured: isAnthropicConfigured(),
      backend: getClaudeBackend(),
      model: getModelForProvider("claude", "growing"),
    },
  };
}
