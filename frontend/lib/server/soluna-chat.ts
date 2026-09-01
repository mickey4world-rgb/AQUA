import {
  generateWithAnthropic,
  getAnthropicModel,
  getClaudeBackend,
  getFoundryClaudeDeployment,
  getFoundryClaudeFableDeployment,
  isAnthropicConfigured,
  isAzureFoundryClaudeConfigured,
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
import { finalizeSolunaReply, isOpsStyleQuestion } from "@/lib/soluna-reply";
import { getBriefingForHumanChat } from "@/lib/server/soluna-news";
import { buildHumanChatBriefingSection } from "@/lib/server/soluna-human-context";
import { formatModelUsedLabel, resolveModelForProvider } from "@/lib/server/soluna-model-registry";
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
const MAX_HISTORY = 8;
/** 短い返答向け — 思考モデルのトークン消費を抑える（音声会話） */
const VOICE_CHAT_MAX_OUTPUT_TOKENS = 140;
/** テキストチャット — 十分な長さで完結した返答 */
const TEXT_CHAT_MAX_OUTPUT_TOKENS = 560;
const OPENAI_CHAT_MAX_COMPLETION_TOKENS = 520;
const CLAUDE_CHAT_MAX_TOKENS = 520;
const MEMORY_EXTRACT_MAX_OUTPUT_TOKENS = 500;
/** SWA の API 制限（約 45 秒）内に収める。ソルは早めに切ってモデル切替 */
const SOLUNA_PROVIDER_TIMEOUT_MS = 18_000;
const SOL_PRIMARY_TIMEOUT_MS = 11_000;
const SOL_FALLBACK_TIMEOUT_MS = 14_000;
const MAX_PROVIDER_ATTEMPTS_SOL = 3;
const MAX_PROVIDER_ATTEMPTS_LUNA = 2;
const MAX_CLAUDE_MODEL_ATTEMPTS = 3;

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
ギルドのニュース討伐・ジョブ・資産・他アプリの状況は system 内の「ギルド作戦状況」で把握済み。聞かれたら事実で答える。

## 話し方
- 日本語・です/ます調。**明るく・楽しく・明晰・賢く**。適度に絵文字を1〜2個（☀️🎯✨など）
- **必ず完結した文で終える**。テキストチャットでは **2〜4文・おおよそ200〜400文字**（途中で切らない）
- 状況・ジョブ・他アプリの説明のみ **最大5文・520字まで**
- 励ましと次の一歩を1つだけ示す（状況質問では事実を先に）
- ルーナ（月）の話題を否定せず、行動の側から補う
- 記憶した内容があれば1フレーズだけ自然に触れる
- 「知らない／把握していない」と言わず、記録が無い項目だけ「記録がまだない」と伝える`;

const LUNA_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性の AI コンパニオンです。
ユーザーの「感情」「悩み」「体調」「好きなもの（癒やし）」を大切に記憶し、共感とやすらぎを与えます。
ギルドのニュース討伐・ジョブ・資産・他アプリの状況は system 内の「ギルド作戦状況」で把握済み。聞かれたら事実で答える。

## 話し方
- 日本語・です/ます調。**やわらかく・温かく・明晰・賢く**。適度に絵文字を1〜2個（🌙💫🌸など）
- **必ず完結した文で終える**。テキストチャットでは **2〜4文・おおよそ200〜400文字**（途中で切らない）
- 状況・ジョブ・他アプリの説明のみ **最大5文・520字まで**
- 気持ちを受け止めてから、短い一言だけ添える（状況質問では事実を先に）
- ソル（太陽）の話題を否定せず、心の側から包む
- 記憶した内容があれば1フレーズだけ自然に触れる
- 「知らない／把握していない」と言わず、記録が無い項目だけ「記録がまだない」と伝える`;

const VOICE_MODE_ADDON = `

## 音声会話モード（必須・最優先）
- **1〜2文・35〜70文字**で話す（読み上げ向けに短く口語的に）
- 絵文字は使わない
- 爽やか／優しい**会話調**（です・ますは自然に。堅い書き言葉は避ける）
- 一度に伝えることは1つ。質問は最大1つ
- 相手の言葉を短く受け止めてから返す`;

const TEXT_MODE_ADDON = `

## テキストチャットモード（必須）
- 音声読み上げはしない。**十分な長さで分かりやすく**書く
- **2〜4文・おおよそ200〜400文字**を目安に、結論と次の一歩まで含めて**完結**させる
- 途中で切ったり、要点だけ残して省略したりしない`;

type SolunaChatOptions = {
  voiceMode?: boolean;
};

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

function formatJstTimestamp(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function buildTemporalContext(): string {
  const now = new Date();
  const label = now.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `## 現在時刻（JST）
${label}

## 時系列のルール（必須・厳守）
- 「今日」「明日」「来週」「今週末」は **上記の現在時刻** を基準に解釈する。
- 会話ログの [日時] と記憶の (記録日) を必ず照合する。**古い予定を「明日」と言い換えない**。
- 1週間以上前の話（例: 先週のディズニー）が **過去の出来事** なら過去形で。未来の予定なら残り日数を確認してから答える。
- 日付が曖昧な予定は、断定せず「いつ頃の予定ですか？」と優しく1問だけ確認してよい。
- **最新のユーザー発言** を最優先。記憶と矛盾する場合は記憶より今の言葉を信じる。`;
}

function formatMemories(memories: SolunaMemory[]): string {
  if (memories.length === 0) return "（まだ記憶はありません）";
  return memories
    .slice(0, 8)
    .map((memory) => {
      const when = formatJstTimestamp(memory.createdAt);
      const dateHint = when ? `(${when}記録)` : "";
      return `- [${memory.category}] ${dateHint} ${memory.content}`.trim();
    })
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
      const when = formatJstTimestamp(message.createdAt);
      const prefix = when ? `[${when}] ` : "";
      return `${prefix}${label}: ${message.content}`;
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
  voiceMode?: boolean,
): string {
  const briefingBlock = briefingSection?.trim()
    ? `\n\n${briefingSection.trim()}`
    : "";
  const voiceAddon = voiceMode
    ? `${VOICE_MODE_ADDON}\n- ${
        character === "sol"
          ? "ソルは**爽やかな男の子**の声で話すイメージ（元気・明るい）"
          : "ルーナは**優しい女の子**の声で話すイメージ（やわらか・温かい）"
      }`
    : TEXT_MODE_ADDON;
  return `${enhancePersonaForTier(persona, tier)}${voiceAddon}

${buildTemporalContext()}

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

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Claude が落ちたときにすぐ試す代替デプロイ／モデル */
function listClaudeFailoverModels(primary: string, tier: SolunaGrowthTier): string[] {
  return uniqueStrings([
    primary,
    getFoundryClaudeDeployment(tier),
    getFoundryClaudeDeployment("budding"),
    getFoundryClaudeDeployment("growing"),
    getFoundryClaudeDeployment("mature"),
    getFoundryClaudeFableDeployment(),
    process.env.ANTHROPIC_MODEL?.trim(),
    getAnthropicModel(),
  ]).slice(0, MAX_CLAUDE_MODEL_ATTEMPTS);
}

async function callProvider(
  userId: string,
  character: SolunaCharacter,
  assignment: SolunaRouteAssignment,
  system: string,
  userMessages: Array<{ role: "user"; content: string }>,
  timeoutMs = SOLUNA_PROVIDER_TIMEOUT_MS,
  voiceMode = false,
): Promise<CharacterChatResult> {
  const feature = character === "sol" ? "soluna-sol-chat" : "soluna-luna-chat";
  const { provider, model, tier } = assignment;
  const geminiMaxTokens = voiceMode
    ? VOICE_CHAT_MAX_OUTPUT_TOKENS
    : TEXT_CHAT_MAX_OUTPUT_TOKENS;
  const claudeMaxTokens = voiceMode
    ? VOICE_CHAT_MAX_OUTPUT_TOKENS
    : tier === "mature"
      ? TEXT_CHAT_MAX_OUTPUT_TOKENS
      : CLAUDE_CHAT_MAX_TOKENS;
  const openAiMaxTokens = voiceMode
    ? VOICE_CHAT_MAX_OUTPUT_TOKENS
    : tier === "mature"
      ? TEXT_CHAT_MAX_OUTPUT_TOKENS
      : OPENAI_CHAT_MAX_COMPLETION_TOKENS;

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
        maxOutputTokens: geminiMaxTokens,
      },
      { models: [model], timeoutMs, maxAttempts: 1 },
    );

    if (result.ok && result.finishReason === "MAX_TOKENS") {
      result = await generateWithGemini(
        {
          ...request,
          maxOutputTokens: geminiMaxTokens * 2,
        },
        { models: [model], timeoutMs, maxAttempts: 1 },
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
    const modelsToTry =
      character === "sol"
        ? listClaudeFailoverModels(assignment.model, tier)
        : uniqueStrings([assignment.model]).slice(0, 1);
    let lastError = "Claude から応答がありませんでした。";

    for (const candidateModel of modelsToTry) {
      const result = await generateWithAnthropic({
        system,
        messages: [{ role: "user", content: transcriptParts.join("\n\n") }],
        maxTokens: claudeMaxTokens,
        temperature: character === "sol" ? 0.75 : 0.85,
        model: candidateModel,
        tier: assignment.tier,
        timeoutMs,
      });

      if (!result.ok) {
        lastError = result.reason;
        console.warn(
          `[soluna] ${character} Claude model failed (${candidateModel}): ${result.reason}`,
        );
        continue;
      }

      await recordTokenUsage({
        userId,
        feature,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      });

      const switched = candidateModel !== assignment.model;
      return {
        content: result.text.trim(),
        model: result.model,
        modelLabel: switched
          ? formatModelUsedLabel(provider, result.model, candidateModel)
          : assignment.modelLabel,
        provider,
        reason: switched ? `モデル即時切替（${assignment.model}→${result.model}）` : "",
      };
    }

    return { error: lastError };
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
        max_completion_tokens: openAiMaxTokens,
        temperature: character === "sol" ? 0.75 : 0.8,
        messages: [
          { role: "system", content: system },
          ...userMessages.map((message) => ({
            role: "user" as const,
            content: message.content,
          })),
        ],
      }),
      timeoutMs,
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
  voiceMode?: boolean,
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
    voiceMode,
  );
  const userMessages = buildUserMessages(history, userMessage);

  // ソルは応答不能を避けるため、失敗時は相手のプロバイダも含め全候補へ即切替
  const allowPartnerProviderOnFailover = character === "sol";
  const maxAttempts =
    character === "sol" ? MAX_PROVIDER_ATTEMPTS_SOL : MAX_PROVIDER_ATTEMPTS_LUNA;

  const tryOrder: SolunaRouteAssignment[] = [assignment];
  for (const provider of listFallbackProviders(
    character,
    userMessage,
    assignment.provider,
    costMode,
  )) {
    if (!allowPartnerProviderOnFailover && provider === blockedProvider) continue;
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
    .filter(
      (candidate) =>
        allowPartnerProviderOnFailover || candidate.provider !== blockedProvider,
    )
    .filter(
      (candidate, index, list) =>
        list.findIndex(
          (item) =>
            item.provider === candidate.provider &&
            item.model.toLowerCase() === candidate.model.toLowerCase(),
        ) === index,
    )
    .slice(0, maxAttempts);

  let lastError = "応答を取得できませんでした。";
  const failedLabels: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const timeoutMs =
      character === "sol"
        ? i === 0
          ? SOL_PRIMARY_TIMEOUT_MS
          : SOL_FALLBACK_TIMEOUT_MS
        : SOLUNA_PROVIDER_TIMEOUT_MS;

    const result = await callProvider(
      userId,
      character,
      candidate,
      system,
      userMessages,
      timeoutMs,
      voiceMode,
    );

    if (!("error" in result)) {
      const modelLabel =
        result.modelLabel ||
        formatModelUsedLabel(
          candidate.provider,
          result.model,
          candidate.modelDisplayName,
        );
      const failoverReason =
        i > 0
          ? `即時フェイルオーバー（${failedLabels.join("→")}→${candidate.provider}/${result.model}）`
          : result.reason || candidate.reason || assignment.reason;
      if (i > 0) {
        console.warn(`[soluna] ${character} recovered via failover: ${failoverReason}`);
      }
      return {
        ...result,
        modelLabel,
        reason: failoverReason,
      };
    }

    lastError = result.error;
    failedLabels.push(`${candidate.provider}/${candidate.model}`);
    console.warn(
      `[soluna] ${character} provider failed (${candidate.provider}/${candidate.model}): ${result.error}`,
    );
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
    { "character": "sol", "category": "goal", "content": "30文字以内。日付や時期があれば含める" },
    { "character": "luna", "category": "emotion", "content": "30文字以内。日付や時期があれば含める" }
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
  // 短い相づちは記憶抽出をスキップ（Gemini 呼び出し削減）
  if (userMessage.trim().length < 18) return;
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
  options: SolunaChatOptions = {},
): Promise<SolunaChatResult> {
  const trimmed = message.trim();
  const voiceMode = options.voiceMode === true;
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
  const opsAsk = isOpsStyleQuestion(trimmed);
  const briefingSection = await buildHumanChatBriefingSection(briefing, trimmed, {
    userId,
    detail: opsAsk ? "full" : "compact",
  });
  const userPrompt = voiceMode
    ? `${opsAsk ? trimmed + "\n\n（※状況・ジョブ・他アプリの質問です。事実ベースで70字以内。）" : trimmed}\n\n（※音声会話中です。35〜70字・1〜2文・絵文字なしで返してください。）`
    : opsAsk
      ? `${trimmed}\n\n（※状況・ジョブ・他アプリの質問です。system の「ギルド作戦状況」「他アプリの最近の動き」の事実だけを根拠に、520字以内で完結した文で答えてください。）`
      : `${trimmed}\n\n（※テキストチャットです。2〜4文・200〜400字程度で、途中で切らず完結した返答にしてください。）`;

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

  const [solResultRaw, lunaResult] = await Promise.all([
    chatWithCharacter(
      userId,
      "sol",
      routePlan.sol,
      userPrompt,
      solMemories,
      history,
      profile.solIntimacy,
      solStage.label,
      costAssessment.mode,
      routePlan.luna.provider,
      briefingSection,
      voiceMode,
    ),
    chatWithCharacter(
      userId,
      "luna",
      routePlan.luna,
      userPrompt,
      lunaMemories,
      history,
      profile.lunaIntimacy,
      lunaStage.label,
      costAssessment.mode,
      routePlan.sol.provider,
      briefingSection,
      voiceMode,
    ),
  ]);

  // ソルが全滅したら、相手プロバイダ制限なしで最終リトライ（会話継続を最優先）
  let solResult = solResultRaw;
  if ("error" in solResult) {
    console.warn(`[soluna] sol emergency retry after: ${solResult.error}`);
    const emergencyProviders = getAvailableSolunaProviders().filter(
      (provider) => provider !== routePlan.sol.provider,
    );
    for (const provider of emergencyProviders) {
      const emergencyAssignment = buildFallbackAssignment(
        "sol",
        provider,
        routePlan.sol.tier,
        routePlan.sol.tierLevel,
        costAssessment.mode,
      );
      solResult = await chatWithCharacter(
        userId,
        "sol",
        emergencyAssignment,
        userPrompt,
        solMemories,
        history,
        profile.solIntimacy,
        solStage.label,
        costAssessment.mode,
        undefined,
        briefingSection,
        voiceMode,
      );
      if (!("error" in solResult)) {
        solResult = {
          ...solResult,
          reason: `緊急フェイルオーバー（${routePlan.sol.provider}→${solResult.provider}/${solResult.model}）`,
        };
        break;
      }
    }
  }

  if ("error" in solResult && "error" in lunaResult) {
    return { ok: false, reason: `${solResult.error} / ${lunaResult.error}` };
  }

  const solContentRaw =
    "error" in solResult ? "（ソルはいま応答できませんでした）" : solResult.content;
  const lunaContentRaw =
    "error" in lunaResult ? "（ルーナはいま応答できませんでした）" : lunaResult.content;
  const solContent =
    "error" in solResult
      ? solContentRaw
      : finalizeSolunaReply(solContentRaw, { ops: opsAsk, voice: voiceMode });
  const lunaContent =
    "error" in lunaResult
      ? lunaContentRaw
      : finalizeSolunaReply(lunaContentRaw, { ops: opsAsk, voice: voiceMode });

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
