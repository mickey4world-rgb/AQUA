import {
  generateWithGemini,
  getGeminiModel,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
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

function getSolModel(): string {
  return process.env.SOLUNA_SOL_MODEL?.trim() || getGeminiModel();
}

function getLunaDeployment(): string {
  return (
    process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    getAzureOpenAiDeployment()
  );
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

async function chatWithSol(
  userId: string,
  userMessage: string,
  memories: SolunaMemory[],
  history: SolunaMessage[],
  intimacy: number,
  stageLabel: string,
): Promise<{ content: string; model: string } | { error: string }> {
  if (!isGeminiConfigured()) {
    return { error: "ソル用 Gemini が未設定です。" };
  }

  const system = `${SOL_PERSONA}

## 育成状態
親密度: ${intimacy}/100（${stageLabel}）

## ソルが覚えていること
${formatMemories(memories)}`;

  const transcript = buildTranscript(history);
  const result = await generateWithGemini({
    system,
    messages: [
      ...(transcript
        ? [{ role: "user" as const, content: `【これまでの会話】\n${transcript}` }]
        : []),
      { role: "user", content: userMessage },
    ],
    maxOutputTokens: 350,
    temperature: 0.75,
  });

  if (!result.ok) return { error: result.reason };

  await recordTokenUsage({
    userId,
    feature: "soluna-sol-chat",
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  return { content: result.text.trim(), model: result.model };
}

async function chatWithLuna(
  userId: string,
  userMessage: string,
  memories: SolunaMemory[],
  history: SolunaMessage[],
  intimacy: number,
  stageLabel: string,
): Promise<{ content: string; model: string } | { error: string }> {
  if (!isAzureOpenAiConfigured()) {
    return { error: "ルーナ用 Azure OpenAI が未設定です。" };
  }

  const deployment = getLunaDeployment();
  const client = getAzureOpenAiClient();
  const system = `${LUNA_PERSONA}

## 育成状態
親密度: ${intimacy}/100（${stageLabel}）

## ルーナが覚えていること
${formatMemories(memories)}`;

  const transcript = buildTranscript(history);
  const messages = [
    { role: "system" as const, content: system },
    ...(transcript
      ? [{ role: "user" as const, content: `【これまでの会話】\n${transcript}` }]
      : []),
    { role: "user" as const, content: userMessage },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 350,
      temperature: 0.8,
      messages,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return { error: "ルーナから応答がありませんでした。" };

    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "soluna-luna-chat",
        model: completion.model ?? deployment,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return { content, model: completion.model ?? deployment };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `ルーナ応答エラー: ${error.message}`
          : "ルーナ応答エラー",
    };
  }
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

  const result = await generateWithGemini({
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
    maxOutputTokens: 800,
    temperature: 0.2,
    responseMimeType: "application/json",
  });

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
      const category = categorySet.has(raw.category) ? raw.category : character === "sol" ? "goal" : "emotion";
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

  const profile = await getOrCreateProfile(userId);
  const [solMemories, lunaMemories, history] = await Promise.all([
    listMemories(userId, "sol"),
    listMemories(userId, "luna"),
    listMessages(userId),
  ]);

  const solStage = resolveGrowthStage("sol", profile.solIntimacy);
  const lunaStage = resolveGrowthStage("luna", profile.lunaIntimacy);

  const [solResult, lunaResult] = await Promise.all([
    chatWithSol(userId, trimmed, solMemories, history, profile.solIntimacy, solStage.label),
    chatWithLuna(userId, trimmed, lunaMemories, history, profile.lunaIntimacy, lunaStage.label),
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

  const newMemories = await extractMemories(userId, trimmed, [...solMemories, ...lunaMemories]);
  await upsertMemories(userId, newMemories);

  const batch = [
    createMessage(userId, "user", trimmed),
    createMessage(userId, "sol", solContent),
    createMessage(userId, "luna", lunaContent),
  ];
  await appendMessages(userId, batch);
  const messages = await listMessages(userId);

  return {
    ok: true,
    data: {
      sol: {
        character: "sol",
        content: solContent,
        model: "error" in solResult ? getSolModel() : solResult.model,
      },
      luna: {
        character: "luna",
        content: lunaContent,
        model: "error" in lunaResult ? getLunaDeployment() : lunaResult.model,
      },
      solIntimacy: nextProfile.solIntimacy,
      lunaIntimacy: nextProfile.lunaIntimacy,
      solStage: resolveGrowthStage("sol", nextProfile.solIntimacy),
      lunaStage: resolveGrowthStage("luna", nextProfile.lunaIntimacy),
      newMemories,
      messages,
    },
  };
}

export function getSolunaProvidersStatus() {
  return {
    sol: { provider: "gemini" as const, model: getSolModel(), configured: isGeminiConfigured() },
    luna: {
      provider: "openai" as const,
      model: getLunaDeployment(),
      configured: isAzureOpenAiConfigured(),
    },
  };
}
