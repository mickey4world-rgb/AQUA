import { generateWithAnthropic, getFoundryClaudeDeployment, isAnthropicConfigured } from "@/lib/server/anthropic";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { resolveDailyBattle } from "@/lib/server/soluna-battle";
import { formatBriefingForPrompt } from "@/lib/server/soluna-news";
import { enrichBriefingWithMonsters, pickBoss } from "@/lib/soluna-monsters";
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
  getSystemHunter,
  getSystemLastRunAt,
  listSystemEpisodes,
  listSystemMessages,
  markSystemRunAt,
  saveSystemHunter,
  saveSystemPersonality,
} from "@/lib/server/soluna-system-store";
import { recordTokenUsage } from "@/lib/server/token-usage";
import type { SolunaNewsBriefing, SolunaSystemMessage, SolunaSystemStateResponse } from "@/lib/types/soluna";

const SYSTEM_TIMEOUT_MS = 18_000;
const SYSTEM_USER_ID = "__system__";

const SOL_SYSTEM_PERSONA = `あなたは「ソル（Sol）」— 太陽を象徴する男性 AI コンパニオンです。
ルーナと朝のニュースを読み解く。ゲーム風の討伐は味付けであり、本業は「ニュースを誰でも分かるようにすること」です。

## 最優先（この順で話す）
1. 何が起きたか — 中学生でも分かる日本語。専門用語は直後に言い換える
2. なぜ大事か — 生活・仕事・お金のどれに効くかを1つ
3. チャンスはどこか — 楽観的な技術推進派としての読み

## 面白さ（理解のあと、1つだけ）
- 比喩は**1つ**。ニュースの芯を照らすたとえ（例: 「高速道路に新しい交通ルールが敷かれた」）
- バトル用語（一撃、急所、逃げられそう）は文末の味付けに1フレーズまで
- たとえで事実をぼかさない。数字・固有名詞は捏造しない

## 話し方
- 日本語。ルーナに話しかける。です/ます基調
- **5〜8行、220〜380文字**。箇条書き禁止
- 最後に「次に見るべき一点」を残す`;

const LUNA_SYSTEM_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性 AI コンパニオンです。
ソルの解説を受けて、読者が誤解しないようニュースを補強する。討伐は味付け。

## 最優先（この順で話す）
1. ソルの説明で足りない事実を補う（誰が損する／何がまだ分からない）
2. リスクを生活の言葉で言い換える
3. 人間が明日できる次の一手を1つ

## 面白さ（理解のあと、1つだけ）
- 比喩は**1つ**。ソルと違うたとえで急所を照らす
- バトル感想は1フレーズ（「今のは急所」「まだ核心まで届いていない」）
- 白熱しきれないときは「結論が一つにまとまらず、逃げられそう」と予兆してよい
- 数字や固有名詞は捏造しない

## 話し方
- 日本語。ソルに返答する。知的で少し皮肉、でも温かい
- **5〜8行、220〜380文字**`;

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
    maxTokens: 700,
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
  const reasoning = /gpt-5|gpt5|o1|o3|o4|reason/i.test(deployment);
  const messages = reasoning
    ? [{ role: "user" as const, content: `${system}\n\n${userPrompt}` }]
    : [
        { role: "system" as const, content: system },
        { role: "user" as const, content: userPrompt },
      ];

  try {
    const requestBody = {
      model: deployment,
      max_completion_tokens: reasoning ? 2800 : 700,
      messages,
      ...(reasoning ? { reasoning_effort: "low" as const } : {}),
    };

    let completion;
    try {
      completion = await client.chat.completions.create(requestBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (reasoning && /reasoning_effort|unknown|unsupported|invalid/i.test(message)) {
        const { reasoning_effort: _ignored, ...fallbackBody } = requestBody;
        completion = await client.chat.completions.create(fallbackBody);
      } else {
        throw error;
      }
    }

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
  const [briefing, messages, lastRunAt, personality, recentEpisodes, hunter, jobs] = await Promise.all([
    getLatestBriefing(),
    listSystemMessages(),
    getSystemLastRunAt(),
    getOrInitSystemPersonality(),
    listSystemEpisodes(6),
    getSystemHunter(),
    import("@/lib/server/soluna-jobs").then((mod) => mod.buildJobsState()),
  ]);

  return {
    briefing,
    messages,
    keywords: [...SOLUNA_SYSTEM_KEYWORDS],
    lastRunAt,
    configured: isSolunaSystemChatConfigured(),
    personality,
    recentEpisodes,
    hunter,
    latestBattle: hunter.battles.length > 0 ? hunter.battles[hunter.battles.length - 1] : null,
    jobs,
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
  const hunter = await getSystemHunter();
  const episodes = await listSystemEpisodes(8);
  const prior = await listSystemMessages(6);
  const encounter = enrichBriefingWithMonsters(briefing);
  const boss = pickBoss(encounter);
  const briefingBlock = formatBriefingForPrompt(encounter);
  const transcript = formatSystemTranscript(prior);
  const relationshipBlock = buildPairRelationshipPrompt(personality);
  const solPersonalityBlock = buildCharacterPersonalityPrompt(personality, "sol", episodes);
  const lunaPersonalityBlock = buildCharacterPersonalityPrompt(personality, "luna", episodes);
  const created: SolunaSystemMessage[] = [];

  const bossLine = boss.monster
    ? `Lv.${boss.monster.rank} ${boss.monster.speciesLabel}「${boss.monster.name}」が現れた`
    : briefing.summary;

  created.push(
    createSystemMessage("system", `⚔️ 朝の討伐開始 — ${bossLine}`, {
      briefingId: briefing.id,
      kind: "narration",
    }),
  );

  const solPrompt = `${briefingBlock}

${transcript ? `【前回の結論（参考。本題は今日のニュース）】\n${transcript}\n\n` : ""}今日の題材は ${boss.monster ? `「${boss.monster.name}」（正体: ${boss.title}）` : boss.title} です。
ルーナに話しかけてください。まずニュースを分かる言葉で説明し、たとえは1つ、チャンスを1つ。`;

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

ソルの説明を受けてください。足りない事実とリスクを生活の言葉で補い、たとえは1つ、次の一手を1つ。`;

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

ルーナの返しを受けて、ニュースの結論を1つにまとめてください。予測と次の一手を分かりやすく。`;

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

  const battle = resolveDailyBattle(encounter, created, hunter);
  created.push(
    createSystemMessage("system", battle.recap, {
      briefingId: briefing.id,
      kind: "battle-recap",
    }),
  );

  await appendSystemMessages(created);
  await saveSystemHunter(battle.hunter);

  const updatedPersonality = applyPostChatPersonalityUpdates(personality, created);
  await saveSystemPersonality(updatedPersonality);
  if (!options?.skipFollowUp) {
    await extractAndSaveEpisodes(created, briefing.id);
  }
  await markSystemRunAt(new Date().toISOString());

  return { ok: true, messages: created, briefing: encounter };
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
システム側ではニュースをモンスター化した討伐をしています。ユーザーの発言と**自然に関連する**ときだけ、怪物名か1フレーズ触れてください。
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
