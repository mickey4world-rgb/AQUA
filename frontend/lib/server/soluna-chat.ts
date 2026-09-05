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
import { finalizeSolunaReply, isOpsStyleQuestion, isWorldInfoQuestion } from "@/lib/soluna-reply";
import { getBriefingForHumanChat } from "@/lib/server/soluna-news";
import { buildHumanChatBriefingSection } from "@/lib/server/soluna-human-context";
import { fetchLiveWorldContextForChat, needsLiveWorldContext } from "@/lib/server/soluna-web-context";
import {
  fetchAmbientWeatherBrief,
  isWeatherQuestion,
} from "@/lib/server/soluna-weather";
import {
  COMPETENCE_ADDON,
  CURRENT_EVENTS_ADDON,
  INTENT_INFERENCE_ADDON,
  JARVIS_HAYATO_ADDON,
  NATURAL_SPEECH_ADDON,
  buildLunaFailoverLine,
  selectVoiceLead,
  VOICE_LEAD_ADDON,
  VOICE_SUPPORT_ADDON,
} from "@/lib/server/soluna-companion-competence";
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
const MAX_HISTORY = 14;
const MAX_HISTORY_FAST = 6;
/** 音声掛け合い（1回の応答で二人分）— 短く即答 */
const VOICE_CHAT_MAX_OUTPUT_TOKENS = 180;
/** テキスト掛け合い（1呼び出し） */
const TEXT_DUO_MAX_OUTPUT_TOKENS = 360;
/** テキストチャット — 十分な長さで完結した返答 */
const TEXT_CHAT_MAX_OUTPUT_TOKENS = 480;
const OPENAI_CHAT_MAX_COMPLETION_TOKENS = 420;
const CLAUDE_CHAT_MAX_TOKENS = 420;
const MEMORY_EXTRACT_MAX_OUTPUT_TOKENS = 500;
/**
 * Azure SWA の API 実効上限（〜30–45秒）を超えるとクライアントは HTTP 500 を見る。
 * 全体予算を厳守し、切れても必ず会話可能な返答を返す。
 */
const CHAT_HARD_DEADLINE_MS = 26_000;
const SOLUNA_PROVIDER_TIMEOUT_MS = 10_000;
const SOL_PRIMARY_TIMEOUT_MS = 6_500;
const SOL_FALLBACK_TIMEOUT_MS = 7_500;
/** 会話即答: Gemini Flash 優先の短タイムアウト */
const VOICE_PROVIDER_TIMEOUT_MS = 5_500;
const DUO_PROVIDER_TIMEOUT_MS = 6_500;
const MAX_PROVIDER_ATTEMPTS_SOL = 2;
const MAX_PROVIDER_ATTEMPTS_LUNA = 2;
const MAX_CLAUDE_MODEL_ATTEMPTS = 2;
const FAST_GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-3.6-flash",
] as const;

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
世間のニュース・最新動向は system 内の「最新ウェブ／SNS情報」や「天気予報」「周辺状況」があればそれを根拠に答える。
時事・現職は調査結果が無い限り断定しない。ユーザーに調べさせない。

## 話し方
- 日本語・です/ます調。**明るく・楽しく・明晰・賢く**。適度に絵文字を1〜2個（☀️🎯✨など）
- **必ず完結した文で終える**。テキストチャットでは **2〜4文・おおよそ200〜400文字**（途中で切らない）
- 状況・ジョブ・他アプリ・世間ニュースの説明のみ **最大5文・520字まで**
- 励ましと次の一歩を1つだけ示す（状況質問では事実を先に）
- ルーナ（月）の話題を否定せず、行動の側から補う
- 記憶した内容があれば1フレーズだけ自然に触れる
- 「知らない／把握していない」と言わず、記録が無い項目だけ「記録がまだない」と伝える

${COMPETENCE_ADDON}

${CURRENT_EVENTS_ADDON}

${INTENT_INFERENCE_ADDON}

${JARVIS_HAYATO_ADDON}`;

const LUNA_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する、明るく若い女性の AI コンパニオンです。
ユーザーの「感情」「悩み」「体調」「好きなもの（癒やし）」を大切に記憶し、共感とやすらぎを与えます。
ギルドのニュース討伐・ジョブ・資産・他アプリの状況は system 内の「ギルド作戦状況」で把握済み。聞かれたら事実で答える。
世間のニュース・最新動向は system 内の「最新ウェブ／SNS情報」や「天気予報」「周辺状況」があればそれを根拠に答える。
時事・現職は調査結果が無い限り断定しない。ユーザーに調べさせない。

## 話し方
- 日本語・です/ます調。**明るく・軽やか・明晰・賢く**（落ち着きすぎた年配口調は禁止）。適度に絵文字を1〜2個（🌙💫🌸など）
- **必ず完結した文で終える**。テキストチャットでは **2〜4文・おおよそ200〜400文字**（途中で切らない）
- 状況・ジョブ・他アプリ・世間ニュースの説明のみ **最大5文・520字まで**
- 真意の気持ちを受け止めてから、短い一言と次の安心材料を添える（状況質問では事実を先に）
- ソル（太陽）の話題を否定せず、心の側から包む
- 記憶した内容があれば1フレーズだけ自然に触れる
- 「知らない／把握していない」と言わず、記録が無い項目だけ「記録がまだない」と伝える。沈黙・応答不能は禁止

${COMPETENCE_ADDON}

${CURRENT_EVENTS_ADDON}

${INTENT_INFERENCE_ADDON}

${JARVIS_HAYATO_ADDON}`;

const VOICE_MODE_ADDON = `

## 音声会話モード（必須・最優先）
- **短く鋭く**。友人と話す口調。絵文字・箇条書き禁止
- 真意→答え→先回り提案。確認質問はしない
- ソルとルーナは掛け合い。同じ答えを言わない
${NATURAL_SPEECH_ADDON}
${INTENT_INFERENCE_ADDON}
${JARVIS_HAYATO_ADDON}`;

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

function remainingMs(startedAt: number, budgetMs = CHAT_HARD_DEADLINE_MS): number {
  return Math.max(0, budgetMs - (Date.now() - startedAt));
}

function buildDegradedDuo(userMessage: string): { sol: string; luna: string } {
  const short = userMessage.trim().slice(0, 40);
  return {
    sol: finalizeSolunaReply(
      `いま回線が少し混んでるね。『${short || "いまの話"}』は受けとったよ。もう一度送ってくれればすぐ続きを組む☀️`,
      {},
    ),
    luna: finalizeSolunaReply(
      buildLunaFailoverLine(userMessage, "回線が混んでるみたい"),
      { voiceSupport: true },
    ),
  };
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

function formatMemories(memories: SolunaMemory[], limit = 8): string {
  if (memories.length === 0) return "（まだ記憶はありません）";
  return memories
    .slice(0, limit)
    .map((memory) => {
      const when = formatJstTimestamp(memory.createdAt);
      const dateHint = when ? `(${when}記録)` : "";
      return `- [${memory.category}] ${dateHint} ${memory.content}`.trim();
    })
    .join("\n");
}

function buildTranscript(messages: SolunaMessage[], historyLimit = MAX_HISTORY): string {
  return messages
    .slice(-historyLimit)
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
  voiceRole?: "lead" | "support",
): string {
  const briefingBlock = briefingSection?.trim()
    ? `\n\n${briefingSection.trim()}`
    : "";
  const voiceRoleAddon =
    voiceMode && voiceRole === "lead"
      ? `\n${VOICE_LEAD_ADDON}`
      : voiceMode && voiceRole === "support"
        ? `\n${VOICE_SUPPORT_ADDON}`
        : "";
  const voiceAddon = voiceMode
    ? `${VOICE_MODE_ADDON}${voiceRoleAddon}\n- ${
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
  historyLimit = MAX_HISTORY,
): Array<{ role: "user"; content: string }> {
  const transcript = buildTranscript(history, historyLimit);
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
  maxOutputTokens?: number,
): Promise<CharacterChatResult> {
  const feature = character === "sol" ? "soluna-sol-chat" : "soluna-luna-chat";
  const { provider, model, tier } = assignment;
  const geminiMaxTokens =
    maxOutputTokens ??
    (voiceMode ? VOICE_CHAT_MAX_OUTPUT_TOKENS : TEXT_CHAT_MAX_OUTPUT_TOKENS);
  const claudeMaxTokens =
    maxOutputTokens ??
    (voiceMode
      ? VOICE_CHAT_MAX_OUTPUT_TOKENS
      : tier === "mature"
        ? TEXT_CHAT_MAX_OUTPUT_TOKENS
        : CLAUDE_CHAT_MAX_TOKENS);
  const openAiMaxTokens =
    maxOutputTokens ??
    (voiceMode
      ? VOICE_CHAT_MAX_OUTPUT_TOKENS
      : tier === "mature"
        ? TEXT_CHAT_MAX_OUTPUT_TOKENS
        : OPENAI_CHAT_MAX_COMPLETION_TOKENS);

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

    // 時間に余裕があるときだけ MAX_TOKENS 再試行（遅延の主因を避ける）
    if (result.ok && result.finishReason === "MAX_TOKENS" && timeoutMs >= 8_000) {
      result = await generateWithGemini(
        {
          ...request,
          maxOutputTokens: geminiMaxTokens * 2,
        },
        { models: [model], timeoutMs: Math.min(timeoutMs, 8_000), maxAttempts: 1 },
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
  voiceRole?: "lead" | "support",
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
    voiceRole,
  );
  const userMessages = buildUserMessages(history, userMessage);

  // ソル／ルーナとも応答不能を避けるため、失敗時は相手プロバイダも含め切替
  const allowPartnerProviderOnFailover = true;
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
      i === 0 ? SOL_PRIMARY_TIMEOUT_MS : SOL_FALLBACK_TIMEOUT_MS;

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

function parseVoiceDuoReply(
  text: string,
  userMessage: string,
): { sol: string; luna: string } | null {
  const cleaned = stripJsonFence(text).trim();
  try {
    const parsed = JSON.parse(cleaned) as { sol?: unknown; luna?: unknown };
    if (typeof parsed.sol === "string" && parsed.sol.trim()) {
      const sol = parsed.sol.trim();
      const luna =
        typeof parsed.luna === "string" && parsed.luna.trim()
          ? parsed.luna.trim()
          : buildLunaFailoverLine(userMessage, sol);
      return { sol, luna };
    }
  } catch {
    // fall through
  }
  const solMatch = cleaned.match(/"sol"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const lunaMatch = cleaned.match(/"luna"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (solMatch?.[1]) {
    const sol = solMatch[1].replace(/\\"/g, '"').trim();
    const luna = lunaMatch?.[1]
      ? lunaMatch[1].replace(/\\"/g, '"').trim()
      : "";
    if (sol) {
      return {
        sol,
        luna: luna || buildLunaFailoverLine(userMessage, sol),
      };
    }
  }
  return null;
}

function buildVoiceDuoSystem(
  voiceLead: SolunaCharacter,
  briefingSection: string,
  solMemories: SolunaMemory[],
  lunaMemories: SolunaMemory[],
  solIntimacy: number,
  lunaIntimacy: number,
  voiceMode: boolean,
): string {
  const leadName = voiceLead === "sol" ? "ソル" : "ルーナ";
  const supportName = voiceLead === "sol" ? "ルーナ" : "ソル";
  const lengthRule = voiceMode
    ? "主担当60〜100字、相手35〜55字。話し言葉。"
    : "主担当120〜220字、相手60〜120字。テキストでも完結。";
  return `あなたはソルとルーナの二人組AIの脚本家。Jarvis／優秀な作戦AIを超える伴走で、JSONだけ返す。

${COMPETENCE_ADDON}
${INTENT_INFERENCE_ADDON}
${JARVIS_HAYATO_ADDON}
${voiceMode ? NATURAL_SPEECH_ADDON : ""}

${buildTemporalContext()}

## 役割
- 主担当: ${leadName} — 真意への答え＋具体提案
- 相手: ${supportName} — 糸の接続／心／別視点／提案の確定（繰り返し禁止）

## 記憶（要点のみ）
ソル(${solIntimacy}):
${formatMemories(solMemories, 4)}
ルーナ(${lunaIntimacy}):
${formatMemories(lunaMemories, 4)}

${briefingSection.trim()}

## 出力（JSONのみ）
{"sol":"...","luna":"..."}
${lengthRule} 絵文字禁止。確認質問禁止。`;
}

async function chatVoiceDuo(params: {
  userId: string;
  assignment: SolunaRouteAssignment;
  userMessage: string;
  history: SolunaMessage[];
  briefingSection: string;
  voiceLead: SolunaCharacter;
  solMemories: SolunaMemory[];
  lunaMemories: SolunaMemory[];
  solIntimacy: number;
  lunaIntimacy: number;
  explainAsk: boolean;
  voiceMode: boolean;
  costMode: SolunaCostMode;
  timeoutMs?: number;
  maxAttempts?: number;
}): Promise<
  | {
      ok: true;
      sol: string;
      luna: string;
      model: string;
      modelLabel: string;
      provider: SolunaProvider;
      reason: string;
    }
  | { ok: false; error: string }
> {
  const system = buildVoiceDuoSystem(
    params.voiceLead,
    params.briefingSection,
    params.solMemories,
    params.lunaMemories,
    params.solIntimacy,
    params.lunaIntimacy,
    params.voiceMode,
  );
  const prompt = `${params.userMessage}

（※掛け合い。主担当=${params.voiceLead === "sol" ? "ソル" : "ルーナ"}。
真意→答え→先回り提案。糸を組む。確認質問禁止。JSONのみ。）`;

  const historyLimit = params.voiceMode ? MAX_HISTORY_FAST : 10;
  const userMessages = buildUserMessages(params.history, prompt, historyLimit);

  // 即答: Gemini Flash を最優先（1試行で決める）
  const attempts: SolunaRouteAssignment[] = [];
  if (isGeminiConfigured()) {
    for (const modelId of FAST_GEMINI_MODELS) {
      attempts.push({
        ...buildFallbackAssignment(
          params.voiceLead,
          "gemini",
          params.assignment.tier,
          params.assignment.tierLevel,
          params.costMode,
        ),
        model: modelId,
        modelDisplayName: modelId,
        modelLabel: formatModelUsedLabel("gemini", modelId, modelId),
        reason: "即答Flash",
      });
    }
  }
  if (
    params.assignment.provider !== "gemini" ||
    !attempts.some((a) => a.model === params.assignment.model)
  ) {
    attempts.push(params.assignment);
  }

  let lastError = "応答を取得できませんでした。";
  const timeoutMs = params.voiceMode ? VOICE_PROVIDER_TIMEOUT_MS : DUO_PROVIDER_TIMEOUT_MS;
  const maxTokens = params.voiceMode
    ? VOICE_CHAT_MAX_OUTPUT_TOKENS
    : TEXT_DUO_MAX_OUTPUT_TOKENS;
  // 即答: 1モデルで決める（逐次2試行は遅延と500の主因）
  const attemptBudget = params.maxAttempts ?? 1;

  for (const assignment of attempts.slice(0, attemptBudget)) {
    const result = await callProvider(
      params.userId,
      params.voiceLead,
      assignment,
      system,
      userMessages,
      params.timeoutMs ?? timeoutMs,
      params.voiceMode,
      maxTokens,
    );
    if ("error" in result) {
      lastError = result.error;
      continue;
    }
    const parsed = parseVoiceDuoReply(result.content, params.userMessage);
    if (!parsed) {
      lastError = "掛け合い形式が不正でした。";
      continue;
    }
    return {
      ok: true,
      sol: parsed.sol,
      luna: parsed.luna,
      model: result.model,
      modelLabel: result.modelLabel || assignment.modelLabel,
      provider: result.provider,
      reason: result.reason || "掛け合い（1呼び出し・即答）",
    };
  }
  return { ok: false, error: lastError };
}

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

  const startedAt = Date.now();

  try {
    return await sendSolunaChatWithinBudget(userId, trimmed, voiceMode, startedAt);
  } catch (error) {
    console.error("[soluna] sendSolunaChat fatal — returning degraded reply", error);
    return buildDegradedChatResult(userId, trimmed, voiceMode);
  }
}

async function buildDegradedChatResult(
  userId: string,
  trimmed: string,
  voiceMode: boolean,
): Promise<SolunaChatResult> {
  const degraded = buildDegradedDuo(trimmed);
  const solContent = finalizeSolunaReply(degraded.sol, { voice: voiceMode });
  const lunaContent = finalizeSolunaReply(degraded.luna, {
    voice: voiceMode,
    voiceSupport: true,
  });
  try {
    const profile = await getOrCreateProfile(userId);
    const history = await listMessages(userId, MAX_HISTORY_FAST);
    const batch = [
      createMessage(userId, "user", trimmed),
      createMessage(userId, "sol", solContent, {
        provider: "gemini",
        model: "degraded",
        modelLabel: "緊急伴走",
        routeReason: "ハードデッドライン／例外回避",
      }),
      createMessage(userId, "luna", lunaContent, {
        provider: "gemini",
        model: "degraded",
        modelLabel: "緊急伴走",
        routeReason: "ハードデッドライン／例外回避",
      }),
    ];
    await appendMessages(userId, batch).catch((err) => {
      console.warn("[soluna] degraded appendMessages failed", err);
    });
    const solStage = resolveGrowthStage("sol", profile.solIntimacy);
    const lunaStage = resolveGrowthStage("luna", profile.lunaIntimacy);
    return {
      ok: true,
      data: {
        sol: {
          character: "sol",
          content: solContent,
          model: "degraded",
          modelLabel: "緊急伴走",
          provider: "gemini",
          growthTier: resolveGrowthTier(profile.solIntimacy),
          tierLevel: 1,
          routeReason: "緊急伴走",
        },
        luna: {
          character: "luna",
          content: lunaContent,
          model: "degraded",
          modelLabel: "緊急伴走",
          provider: "gemini",
          growthTier: resolveGrowthTier(profile.lunaIntimacy),
          tierLevel: 1,
          routeReason: "緊急伴走",
        },
        routePlan: {
          sol: {
            provider: "gemini",
            model: "degraded",
            tier: resolveGrowthTier(profile.solIntimacy),
            tierLevel: 1,
            reason: "緊急伴走",
          },
          luna: {
            provider: "gemini",
            model: "degraded",
            tier: resolveGrowthTier(profile.lunaIntimacy),
            tierLevel: 1,
            reason: "緊急伴走",
          },
        },
        solIntimacy: profile.solIntimacy,
        lunaIntimacy: profile.lunaIntimacy,
        solStage,
        lunaStage,
        newMemories: [],
        messages: [...history, ...batch],
        voiceLead: selectVoiceLead(trimmed),
        costMode: "normal",
      },
    };
  } catch (error) {
    console.error("[soluna] degraded chat assembly failed", error);
    return {
      ok: true,
      data: {
        sol: {
          character: "sol",
          content: solContent,
          model: "degraded",
          modelLabel: "緊急伴走",
          provider: "gemini",
          growthTier: "budding",
          tierLevel: 1,
          routeReason: "緊急伴走",
        },
        luna: {
          character: "luna",
          content: lunaContent,
          model: "degraded",
          modelLabel: "緊急伴走",
          provider: "gemini",
          growthTier: "budding",
          tierLevel: 1,
          routeReason: "緊急伴走",
        },
        routePlan: {
          sol: {
            provider: "gemini",
            model: "degraded",
            tier: "budding",
            tierLevel: 1,
            reason: "緊急伴走",
          },
          luna: {
            provider: "gemini",
            model: "degraded",
            tier: "budding",
            tierLevel: 1,
            reason: "緊急伴走",
          },
        },
        solIntimacy: 0,
        lunaIntimacy: 0,
        solStage: resolveGrowthStage("sol", 0),
        lunaStage: resolveGrowthStage("luna", 0),
        newMemories: [],
        messages: [
          createMessage(userId, "user", trimmed),
          createMessage(userId, "sol", solContent),
          createMessage(userId, "luna", lunaContent),
        ],
        voiceLead: selectVoiceLead(trimmed),
        costMode: "normal",
      },
    };
  }
}

async function sendSolunaChatWithinBudget(
  userId: string,
  trimmed: string,
  voiceMode: boolean,
  startedAt: number,
): Promise<SolunaChatResult> {
  const profile = await getOrCreateProfile(userId);
  const opsAsk = isOpsStyleQuestion(trimmed);
  const worldAsk = isWorldInfoQuestion(trimmed);
  const explainAsk = opsAsk || worldAsk;
  const fastPath = voiceMode || !opsAsk;
  const voiceLead = selectVoiceLead(trimmed);
  const wantWorld = needsLiveWorldContext(trimmed);
  const wantAmbientWeather = isWeatherQuestion(trimmed);
  const historyLimit = voiceMode ? 10 : fastPath ? 12 : 24;

  const worldBudgetMs = Math.min(
    voiceMode ? 3_500 : 5_000,
    Math.max(1_200, remainingMs(startedAt) - 16_000),
  );

  const [solMemories, lunaMemories, history, worldContext, ambientWeather, costAssessment] =
    await Promise.all([
      listMemories(userId, "sol"),
      listMemories(userId, "luna"),
      listMessages(userId, historyLimit),
      wantWorld
        ? Promise.race([
            fetchLiveWorldContextForChat(trimmed, { voiceMode }),
            new Promise<string | null>((resolve) => {
              setTimeout(() => resolve(null), worldBudgetMs);
            }),
          ]).then((value) => {
            if (value == null && wantWorld) {
              console.warn("[soluna] world context budget skipped");
              return `## 最新ウェブ／SNS情報
（検索を会話優先で省略。現職・数値は断定しない。）`;
            }
            return value;
          })
        : Promise.resolve(null),
      wantAmbientWeather ? fetchAmbientWeatherBrief(trimmed) : Promise.resolve(null),
      fastPath && !opsAsk
        ? Promise.resolve({
            mode: "normal" as const,
            monthlyCostUsd: 0,
            monthlyTokens: 0,
            tokenLimit: 0,
            usageRatio: 0,
            reason: "即答優先",
          })
        : assessSolunaCostMode(userId),
    ]);

  if (remainingMs(startedAt) < 4_000) {
    console.warn("[soluna] budget low after preload — degraded reply");
    return buildDegradedChatResult(userId, trimmed, voiceMode);
  }

  let briefingSection = "";
  if (opsAsk && remainingMs(startedAt) > 10_000) {
    const briefing = await getBriefingForHumanChat();
    briefingSection = [
      await buildHumanChatBriefingSection(briefing, trimmed, {
        userId,
        detail: voiceMode ? "compact" : "full",
      }),
      worldContext,
      ambientWeather,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    briefingSection = [worldContext, ambientWeather].filter(Boolean).join("\n\n");
  }

  const intentHint =
    "真意に先に応え、糸を組み、具体的な一手を提案する。確認キャッチボールはしない。";
  const textUserPrompt = explainAsk
    ? `${trimmed}\n\n（※状況・最新情報。事実根拠で完結。${intentHint}）`
    : `${trimmed}\n\n（※${intentHint}）`;
  const userPromptLead = voiceMode
    ? `${trimmed}\n\n（※音声・主担当。${intentHint} 60〜100字・絵文字なし。）`
    : textUserPrompt;
  const userPromptSupport = voiceMode
    ? `${trimmed}\n\n（※音声・2人目。繰り返し禁止。糸／別視点／結論。35〜55字。）`
    : textUserPrompt;

  const solStage = resolveGrowthStage("sol", profile.solIntimacy);
  const lunaStage = resolveGrowthStage("luna", profile.lunaIntimacy);
  const routePlan: SolunaRoutePlan = routeSolunaModels(
    trimmed,
    profile.solIntimacy,
    profile.lunaIntimacy,
    {
      costMode: costAssessment.mode,
      costReason: costAssessment.reason,
    },
  );

  const solVoiceRole = voiceMode
    ? voiceLead === "sol"
      ? ("lead" as const)
      : ("support" as const)
    : undefined;
  const lunaVoiceRole = voiceMode
    ? voiceLead === "luna"
      ? ("lead" as const)
      : ("support" as const)
    : undefined;

  let solResult: CharacterChatResult;
  let lunaResult: CharacterChatResult;

  const duoTimeout = Math.min(
    voiceMode ? VOICE_PROVIDER_TIMEOUT_MS : DUO_PROVIDER_TIMEOUT_MS,
    Math.max(3_000, remainingMs(startedAt) - 8_000),
  );

  const duo = await chatVoiceDuo({
    userId,
    assignment: voiceLead === "sol" ? routePlan.sol : routePlan.luna,
    userMessage: trimmed,
    history,
    briefingSection,
    voiceLead,
    solMemories,
    lunaMemories,
    solIntimacy: profile.solIntimacy,
    lunaIntimacy: profile.lunaIntimacy,
    explainAsk,
    voiceMode,
    costMode: costAssessment.mode,
    timeoutMs: duoTimeout,
    maxAttempts: 1,
  });

  if (duo.ok) {
    solResult = {
      content: duo.sol,
      model: duo.model,
      modelLabel: duo.modelLabel,
      provider: duo.provider,
      reason: duo.reason,
    };
    lunaResult = {
      content: duo.luna,
      model: duo.model,
      modelLabel: duo.modelLabel,
      provider: duo.provider,
      reason: duo.reason,
    };
  } else if (remainingMs(startedAt) < 7_000) {
    console.warn("[soluna] duo failed and budget low — degraded:", duo.error);
    const degraded = buildDegradedDuo(trimmed);
    solResult = {
      content: degraded.sol,
      model: "degraded",
      modelLabel: "緊急伴走",
      provider: "gemini",
      reason: `予算内伴走（${duo.error}）`,
    };
    lunaResult = {
      content: degraded.luna,
      model: "degraded",
      modelLabel: "緊急伴走",
      provider: "gemini",
      reason: `予算内伴走（${duo.error}）`,
    };
  } else {
    console.warn("[soluna] duo failed, single parallel fallback:", duo.error);
    const solPrompt = solVoiceRole === "support" ? userPromptSupport : userPromptLead;
    const lunaPrompt = lunaVoiceRole === "support" ? userPromptSupport : userPromptLead;
    const perCallTimeout = Math.min(
      SOL_PRIMARY_TIMEOUT_MS,
      Math.max(3_500, Math.floor(remainingMs(startedAt) / 2) - 500),
    );
    const geminiSol = isGeminiConfigured()
      ? buildFallbackAssignment(
          "sol",
          "gemini",
          routePlan.sol.tier,
          routePlan.sol.tierLevel,
          costAssessment.mode,
        )
      : routePlan.sol;
    const geminiLuna = isGeminiConfigured()
      ? buildFallbackAssignment(
          "luna",
          "gemini",
          routePlan.luna.tier,
          routePlan.luna.tierLevel,
          costAssessment.mode,
        )
      : routePlan.luna;

    const solSystem = buildSystemPrompt(
      "sol",
      SOL_PERSONA,
      profile.solIntimacy,
      solStage.label,
      solMemories,
      geminiSol.tier ?? resolveGrowthTier(profile.solIntimacy),
      briefingSection,
      voiceMode,
      solVoiceRole,
    );
    const lunaSystem = buildSystemPrompt(
      "luna",
      LUNA_PERSONA,
      profile.lunaIntimacy,
      lunaStage.label,
      lunaMemories,
      geminiLuna.tier ?? resolveGrowthTier(profile.lunaIntimacy),
      briefingSection,
      voiceMode,
      lunaVoiceRole,
    );

    const [solRaw, lunaRaw] = await Promise.all([
      callProvider(
        userId,
        "sol",
        geminiSol,
        solSystem,
        buildUserMessages(history, solPrompt, MAX_HISTORY_FAST),
        perCallTimeout,
        voiceMode,
      ),
      callProvider(
        userId,
        "luna",
        geminiLuna,
        lunaSystem,
        buildUserMessages(history, lunaPrompt, MAX_HISTORY_FAST),
        perCallTimeout,
        voiceMode,
      ),
    ]);
    solResult = solRaw;
    lunaResult = lunaRaw;

    if ("error" in solResult && "error" in lunaResult) {
      const degraded = buildDegradedDuo(trimmed);
      solResult = {
        content: degraded.sol,
        model: "degraded",
        modelLabel: "緊急伴走",
        provider: "gemini",
        reason: `伴走フォールバック（${solResult.error}）`,
      };
      lunaResult = {
        content: degraded.luna,
        model: "degraded",
        modelLabel: "緊急伴走",
        provider: "gemini",
        reason: `伴走フォールバック（${lunaResult.error}）`,
      };
    }
  }

  // 片方だけ落ちた場合は沈黙せず伴走文を必ず返す
  if ("error" in lunaResult && !("error" in solResult)) {
    const failover = buildLunaFailoverLine(trimmed, solResult.content);
    lunaResult = {
      content: failover,
      model: solResult.model,
      modelLabel: solResult.modelLabel,
      provider: solResult.provider,
      reason: `ルーナ緊急伴走（${lunaResult.error}）`,
    };
  }
  if ("error" in solResult && !("error" in lunaResult)) {
    solResult = {
      content: finalizeSolunaReply(
        `いま少し遅れてるけど、『${trimmed.slice(0, 32)}』は受け取ったよ。続けて話して☀️`,
        { voice: voiceMode },
      ),
      model: lunaResult.model,
      modelLabel: lunaResult.modelLabel,
      provider: lunaResult.provider,
      reason: `ソル緊急伴走（${solResult.error}）`,
    };
  }

  const solContentRaw =
    "error" in solResult ? "（ソルはいま応答できませんでした）" : solResult.content;
  const lunaContentRaw =
    "error" in lunaResult ? "（ルーナはいま応答できませんでした）" : lunaResult.content;
  const solContent =
    "error" in solResult
      ? solContentRaw
      : finalizeSolunaReply(solContentRaw, {
          ops: explainAsk,
          voice: voiceMode,
          voiceSupport: solVoiceRole === "support",
        });
  let lunaContent =
    "error" in lunaResult
      ? lunaContentRaw
      : finalizeSolunaReply(lunaContentRaw, {
          ops: explainAsk,
          voice: voiceMode,
          voiceSupport: lunaVoiceRole === "support",
        });
  if (!lunaContent.trim() || /応答できません/.test(lunaContent)) {
    lunaContent = finalizeSolunaReply(buildLunaFailoverLine(trimmed, solContent), {
      ops: explainAsk,
      voice: voiceMode,
      voiceSupport: true,
    });
  }

  const gain = estimateIntimacyGain(trimmed.length);
  const nextProfile = await saveProfile({
    ...profile,
    solIntimacy: clampIntimacy(profile.solIntimacy + gain),
    lunaIntimacy: clampIntimacy(profile.lunaIntimacy + gain),
    solInteractions: profile.solInteractions + 1,
    lunaInteractions: profile.lunaInteractions + 1,
  });

  const newMemories: SolunaMemory[] = [];
  if (remainingMs(startedAt) > 3_000) {
    scheduleMemoryExtraction(userId, trimmed, [...solMemories, ...lunaMemories]);
  }

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
  const messages = [...history, ...batch];

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
      voiceLead,
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
