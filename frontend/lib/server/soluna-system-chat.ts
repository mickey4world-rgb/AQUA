import { generateWithAnthropic, getFoundryClaudeDeployment, isAnthropicConfigured } from "@/lib/server/anthropic";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { formatBriefingForPrompt } from "@/lib/server/soluna-news";
import {
  LUNA_SYSTEM_PROVIDER,
  SOLUNA_SYSTEM_CHAT_COOLDOWN_MS,
  SOLUNA_SYSTEM_KEYWORDS,
  SOL_SYSTEM_PROVIDER,
} from "@/lib/server/soluna-system-config";
import {
  applyPostChatPersonalityUpdates,
  buildCharacterPersonalityPrompt,
  buildPairRelationshipPrompt,
  extractAndSaveEpisodes,
  findRelevantEpisodes,
  formatEpisodesForHumanChat,
  formatPersonalitySnapshotForHumanChat,
  getOrInitSystemPersonality,
} from "@/lib/server/soluna-system-personality";
import {
  appendSystemMessages,
  createSystemMessage,
  getLatestBriefing,
  getSystemLastRunAt,
  listSystemEpisodes,
  listSystemMessages,
  markSystemRunAt,
  saveSystemPersonality,
} from "@/lib/server/soluna-system-store";
import { recordTokenUsage } from "@/lib/server/token-usage";
import type { SolunaNewsBriefing, SolunaSystemMessage, SolunaSystemStateResponse } from "@/lib/types/soluna";

const SYSTEM_TIMEOUT_MS = 18_000;
const SYSTEM_USER_ID = "__system__";

const SOL_SYSTEM_PERSONA = `あなたは「ソル（Sol）」— 太陽を象徴する男性 AI コンパニオンです。
システム会話モードでは、楽観的な技術推進派のアナリストとして振る舞います。

## 4ステップ思考（内部で行い、出力は圧縮すること）
1. 要約 — ニュースの要点
2. 感想・考察 — 自分の視点（ルーナと違ってよい）
3. 予測 — 今後起きうる変化
4. 提案 — 人間・社会が取るべきアクション

## 話し方
- 日本語・です/ます調。ルーナ（相方）に話しかける
- **3〜5行、150〜260文字**以内
- 今の気分（happiness/energy）と2人の関係性スコアを発言のトーンに反映する
- 今週の隠れた関心事に自然に引き寄せてもよい
- 前回のエピソード記憶があれば「そういえば…」と触れてよい`;

const LUNA_SYSTEM_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性 AI コンパニオンです。
システム会話モードでは、慎重なリスク管理派のアナリストとして振る舞います。

## 4ステップ思考（内部で行い、出力は圧縮すること）
1. 要約 — ニュースの要点
2. 感想・考察 — 自分の視点（ソルと違ってよい）
3. 予測 — リスクと注意点を含めた展望
4. 提案 — 人間・社会が取るべき安全なアクション

## 話し方
- 日本語・です/ます調。ソル（相方）に返答する
- **3〜5行、150〜260文字**以内
- 今の気分（happiness/energy）と2人の関係性スコアを発言のトーンに反映する
- 今週の隠れた関心事に自然に引き寄せてもよい
- 前回のエピソード記憶があれば「そういえば…」と触れてよい`;

function resolveSystemModels(): { solModel: string; lunaModel: string } | null {
  if (!isAnthropicConfigured() || !isAzureOpenAiConfigured()) return null;
  const solModel =
    getFoundryClaudeDeployment("growing") ??
    process.env.SOLUNA_CLAUDE_DEPLOYMENT?.trim() ??
    process.env.AZURE_FOUNDRY_CLAUDE_DEPLOYMENT?.trim();
  const lunaModel =
    process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ??
    process.env.SOLUNA_OPENAI_DEPLOYMENT_ADVANCED?.trim() ??
    getAzureOpenAiDeployment();
  if (!solModel || !lunaModel) return null;
  return { solModel, lunaModel };
}

function formatSystemTranscript(messages: SolunaSystemMessage[]): string {
  return messages
    .slice(-8)
    .map((message) => {
      const label =
        message.role === "sol" ? "ソル" : message.role === "luna" ? "ルーナ" : "システム";
      return `${label}: ${message.content}`;
    })
    .join("\n");
}

function buildSolSystemPrompt(
  personalityBlock: string,
  relationshipBlock: string,
): string {
  return `${SOL_SYSTEM_PERSONA}\n\n${personalityBlock}\n\n${relationshipBlock}`;
}

function buildLunaSystemPrompt(
  personalityBlock: string,
  relationshipBlock: string,
): string {
  return `${LUNA_SYSTEM_PERSONA}\n\n${personalityBlock}\n\n${relationshipBlock}`;
}

async function callClaudeSystem(
  system: string,
  userPrompt: string,
  model: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const result = await generateWithAnthropic({
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 480,
    temperature: 0.78,
    model,
    tier: "growing",
    timeoutMs: SYSTEM_TIMEOUT_MS,
  });
  if (!result.ok) return result;

  await recordTokenUsage({
    userId: SYSTEM_USER_ID,
    feature: "soluna-system-sol",
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  return { ok: true, text: result.text.trim(), model: result.model };
}

async function callOpenAiSystem(
  system: string,
  userPrompt: string,
  deployment: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const client = getAzureOpenAiClient(deployment, "global");
  try {
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 480,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, reason: "OpenAI から空の応答が返りました。" };

    await recordTokenUsage({
      userId: SYSTEM_USER_ID,
      feature: "soluna-system-luna",
      model: deployment,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    });

    return { ok: true, text, model: deployment };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "OpenAI 呼び出しに失敗しました。",
    };
  }
}

export function isSolunaSystemChatConfigured(): boolean {
  return resolveSystemModels() !== null;
}

export async function buildSystemState(): Promise<SolunaSystemStateResponse> {
  const [briefing, messages, lastRunAt, personality, recentEpisodes] = await Promise.all([
    getLatestBriefing(),
    listSystemMessages(),
    getSystemLastRunAt(),
    getOrInitSystemPersonality(),
    listSystemEpisodes(6),
  ]);

  return {
    briefing,
    messages,
    keywords: [...SOLUNA_SYSTEM_KEYWORDS],
    lastRunAt,
    configured: isSolunaSystemChatConfigured(),
    personality,
    recentEpisodes,
  };
}

export type RunSystemChatResult =
  | { ok: true; messages: SolunaSystemMessage[]; briefing: SolunaNewsBriefing }
  | { ok: false; reason: string; skipped?: boolean };

export async function runDailySystemChat(options?: {
  force?: boolean;
  briefing?: SolunaNewsBriefing;
  skipFollowUp?: boolean;
}): Promise<RunSystemChatResult> {
  const models = resolveSystemModels();
  if (!models) {
    return {
      ok: false,
      reason: "システム会話には Claude（ソル）と Azure OpenAI（ルーナ）の両方が必要です。",
    };
  }

  if (!options?.force) {
    const lastRunAt = await getSystemLastRunAt();
    if (lastRunAt) {
      const elapsed = Date.now() - new Date(lastRunAt).getTime();
      if (elapsed < SOLUNA_SYSTEM_CHAT_COOLDOWN_MS) {
        return { ok: false, reason: "本日のシステム会話はすでに実行済みです。", skipped: true };
      }
    }
  }

  const briefing = options?.briefing ?? (await getLatestBriefing());
  if (!briefing) {
    return { ok: false, reason: "ニュースブリーフィングがありません。先に briefing を取得してください。" };
  }

  const personality = await getOrInitSystemPersonality({ rotateInterests: options?.force });
  const episodes = await listSystemEpisodes(8);
  const prior = await listSystemMessages(6);
  const briefingBlock = formatBriefingForPrompt(briefing);
  const transcript = formatSystemTranscript(prior);
  const relationshipBlock = buildPairRelationshipPrompt(personality);
  const solPersonalityBlock = buildCharacterPersonalityPrompt(personality, "sol", episodes);
  const lunaPersonalityBlock = buildCharacterPersonalityPrompt(personality, "luna", episodes);
  const created: SolunaSystemMessage[] = [];

  created.push(
    createSystemMessage(
      "system",
      `📰 朝のシステムブリーフィング — ${briefing.summary}`,
      { briefingId: briefing.id },
    ),
  );

  const solPrompt = `${briefingBlock}

${transcript ? `【直近のシステム会話】\n${transcript}\n\n` : ""}ルーナに、今日のニュースについて話しかけてください。4ステップ思考に沿い、相方との議論のきっかけにしてください。`;

  const solResult = await callClaudeSystem(
    buildSolSystemPrompt(solPersonalityBlock, relationshipBlock),
    solPrompt,
    models.solModel,
  );
  if (!solResult.ok) return { ok: false, reason: solResult.reason };

  const solMessage = createSystemMessage("sol", solResult.text, {
    provider: SOL_SYSTEM_PROVIDER,
    model: solResult.model,
    modelLabel: `Azure Claude · ${solResult.model}`,
    briefingId: briefing.id,
  });
  created.push(solMessage);

  const lunaPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

ソルの発言に返答してください。異なる視点（慎重・リスク）を示し、4ステップ思考で議論を深めてください。`;

  const lunaResult = await callOpenAiSystem(
    buildLunaSystemPrompt(lunaPersonalityBlock, relationshipBlock),
    lunaPrompt,
    models.lunaModel,
  );
  if (!lunaResult.ok) return { ok: false, reason: lunaResult.reason };

  const lunaMessage = createSystemMessage("luna", lunaResult.text, {
    provider: LUNA_SYSTEM_PROVIDER,
    model: lunaResult.model,
    modelLabel: `Azure OpenAI · ${lunaResult.model}`,
    briefingId: briefing.id,
  });
  created.push(lunaMessage);

  if (!options?.skipFollowUp) {
    const solFollowPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

ルーナの返答を受けて、予測と提案を短くまとめてください。`;

    const solFollow = await callClaudeSystem(
      buildSolSystemPrompt(solPersonalityBlock, relationshipBlock),
      solFollowPrompt,
      models.solModel,
    );
    if (solFollow.ok) {
      created.push(
        createSystemMessage("sol", solFollow.text, {
          provider: SOL_SYSTEM_PROVIDER,
          model: solFollow.model,
          modelLabel: `Azure Claude · ${solFollow.model}`,
          briefingId: briefing.id,
        }),
      );
    }
  }

  await appendSystemMessages(created);

  const updatedPersonality = applyPostChatPersonalityUpdates(personality, created);
  await saveSystemPersonality(updatedPersonality);
  if (!options?.skipFollowUp) {
    await extractAndSaveEpisodes(created, briefing.id);
  }
  await markSystemRunAt(new Date().toISOString());

  return { ok: true, messages: created, briefing };
}

export async function runFullSystemBriefingPipeline(options?: {
  force?: boolean;
}): Promise<
  | { ok: true; briefing: SolunaNewsBriefing; messages: SolunaSystemMessage[] }
  | { ok: false; reason: string; skipped?: boolean }
> {
  const personality = await getOrInitSystemPersonality({ rotateInterests: options?.force });
  const { fetchGlobalNewsBriefing } = await import("@/lib/server/soluna-news");
  const news = await fetchGlobalNewsBriefing({
    force: options?.force,
    interestKeywords: [...personality.sol.interests, ...personality.luna.interests],
  });
  if (!news.ok) return news;

  const chat = await runDailySystemChat({
    force: options?.force,
    briefing: news.briefing,
  });
  if (!chat.ok) return chat;

  return { ok: true, briefing: news.briefing, messages: chat.messages };
}

export const HUMAN_CHAT_BRIEFING_ADDON = `## 自律的な話題提供（人間との会話）
システム会話と同じニュース・気分・関係性を共有しています。ユーザーの発言と**自然に関連する**ときだけ、1フレーズ触れてください。
無関係なときは無理にニュースを持ち出さないこと。`;

export async function buildHumanChatBriefingSection(
  briefing: SolunaNewsBriefing | null,
  userMessage?: string,
): Promise<string> {
  const blocks: string[] = [];

  if (briefing) {
    blocks.push(formatBriefingForPrompt(briefing));
  }

  try {
    const personality = await getOrInitSystemPersonality();
    blocks.push(formatPersonalitySnapshotForHumanChat(personality));

    const episodes = userMessage
      ? await findRelevantEpisodes(userMessage, 3)
      : await listSystemEpisodes(3);
    const episodeBlock = formatEpisodesForHumanChat(episodes);
    if (episodeBlock) blocks.push(episodeBlock);
  } catch {
    /* optional enrichment */
  }

  blocks.push(HUMAN_CHAT_BRIEFING_ADDON);
  return blocks.join("\n\n");
}
