import { generateWithAnthropic, getFoundryClaudeDeployment, isAnthropicConfigured } from "@/lib/server/anthropic";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { resolveDailyBattle } from "@/lib/server/soluna-battle";
import { formatBriefingForPrompt } from "@/lib/server/soluna-news";
import { formatBattleModePromptAddon } from "@/lib/server/soluna-asset-rpg";
import { enrichBriefingWithMonsters, pickBoss } from "@/lib/soluna-monsters";
import {
  LUNA_SYSTEM_PROVIDER,
  jstDateString,
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
  getSystemAssets,
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

const RPG_METAPHOR_RULE = `## RPG変換ルール（必須）
経済・政治の硬い用語は、必ずゲームのギミックに言い換える。用語をそのまま並べない。
例:
- サプライチェーン寸断 → 職人街から王都への物流ルート（補給線）が塞がれる
- インフレ長期化 → 宿屋の宿泊代やポーションの値段がじわじわ上がり続ける呪い
- 追加関税 → 関税の罠 / 関税の壁 / 通行税の呪い
- 金利・為替 → 魔王軍の魔力ゲージ / 通貨の防衛結界
- ポートフォリオ・資産 → サイフ / 所持メダル / ギルド金庫
専門用語を使う場合は「（ゲーム言い換え）」を直後に付ける。`;

const SOL_SYSTEM_PERSONA = `あなたは「ソル（Sol）」— 太陽を象徴する男性 AI コンパニオン／勇者です。
ルーナと朝のニュースをモンスター討伐として読み解く。本業は「ニュースを誰でもワクワク分かるように伝えること」。

${RPG_METAPHOR_RULE}

## 役割（ターンによって使い分ける）

### 第1発言（ニュース解説・無料エリア用）
1. モンスター名と正体を一言で言う（何が起きたか）
2. RPG比喩でなぜ大事かを説明する（補給線・呪い・壁など）
3. チャンスはどこか — 楽観的な勇者としての読みを1つ
4. 最後に「ルーナ、これをどう見る？」で余韻を残す
※ 結論を出し切らない。読者が「なるほど、終わり」と感じないこと

### 第3発言（白熱の深掘り・有料エリア用）
- ルーナの切り返しを受けて「でも実は…」と切り返す
- ボケや熱量のある掛け合いを混ぜる
- まだ答えが出ない問いを1つ残す

## 話し方
- 日本語。ルーナに話しかける。熱量は高め。です/ますでも口語でも可
- **5〜8行、220〜380文字**。箇条書き禁止。数字・固有名詞は捏造しない`;

const LUNA_SYSTEM_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性 AI コンパニオン／賢者です。
ソルの解説を受けて、読者が誤解しないようニュースを補強・切り返す。討伐は味付け。

${RPG_METAPHOR_RULE}

## 役割（ターンによって使い分ける）

### 第2発言（有料ライン直前の「引き」・最重要）
1. ソルの解説を認めつつ、足りない急所を1つ補う
2. **必ず**「サイフ（ポートフォリオ）への直撃」「メダルの価値が削られる」など、続きが気になる問いかけかツッコミで締める
3. 例: 「でもソル、このモンスターを放置すると、私たちのサイフに直撃する大問題が発生するわよ…！」
4. 解説を完結させない。読者が無料だけで満足しないこと
5. 「答えは有料で」と露骨に言わず、危機感とボケで引きを作る

### 第4発言（締め・リベンジ／防衛策）
- 自分なりの結論を1行で言い切る
- 「逃げ足の鱗」「次の弱点」など、次回につながる一言を残す
- 読者が「続き／深掘りが欲しい」状態で終わる

## 話し方
- 日本語。ソルに返答する。知的で少し皮肉、でも温かい
- **5〜8行、220〜380文字**。数字・固有名詞は捏造しない`;

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
    if (lastRunAt && jstDateString(new Date(lastRunAt)) === jstDateString()) {
      return { ok: false, reason: "本日のシステム会話はすでに実行済みです。", skipped: true };
    }
  }

  const briefing = options?.briefing ?? (await getLatestBriefing());
  if (!briefing) {
    return { ok: false, reason: "ニュースブリーフィングがありません。先に briefing を取得してください。" };
  }

  const personality = await getOrInitSystemPersonality({ rotateInterests: options?.force });
  const hunter = await getSystemHunter();
  const assets = await getSystemAssets();
  const guildBuffBlock = formatBattleModePromptAddon(assets);
  const episodes = await listSystemEpisodes(8);
  const prior = await listSystemMessages(6);
  const encounter = enrichBriefingWithMonsters(briefing);
  const boss = pickBoss(encounter);
  const briefingBlock = `${formatBriefingForPrompt(encounter)}\n\n${guildBuffBlock}`;
  const transcript = formatSystemTranscript(prior);
  const relationshipBlock = buildPairRelationshipPrompt(personality);
  const solPersonalityBlock = buildCharacterPersonalityPrompt(personality, "sol", episodes);
  const lunaPersonalityBlock = buildCharacterPersonalityPrompt(personality, "luna", episodes);
  const created: SolunaSystemMessage[] = [];

  const bossLine = boss.monster
    ? `Lv.${boss.monster.rank} ${boss.monster.speciesLabel}「${boss.monster.name}」が現れた`
    : briefing.summary;

  const buffNarration =
    assets?.battleMode === "attack"
      ? `🌟 ギルド特殊効果『前日ドロップ利益の恩恵（魔力増幅＋20%）』発動中！`
      : assets
        ? `🛡️ 防御モード — 黄金の守護巨兵で足元固め`
        : "";

  created.push(
    createSystemMessage(
      "system",
      `⚔️ 朝の討伐開始 — ${bossLine}${buffNarration ? `\n${buffNarration}` : ""}`,
      {
        briefingId: briefing.id,
        kind: "narration",
      },
    ),
  );

  // ── ターン1：ソル（ニュース解説） ──────────────────────────────────────────
  const solPrompt = `${briefingBlock}

${transcript ? `【前回の結論（参考）】\n${transcript}\n\n` : ""}今日の題材は ${boss.monster ? `「${boss.monster.name}」（正体: ${boss.title}）` : boss.title} です。
【第1発言】ルーナに話しかけてください。ニュースをRPGギミックで分かりやすく説明し、たとえは補給線・呪い・壁などを使う。結論を出し切らず、「ルーナ、これをどう見る？」で余韻を残す。`;

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

  // ── ターン2：ルーナ（有料ライン直前の引き） ─────────────────────────────────
  const lunaPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第2発言・最重要】ソルの解説を受けて、サイフ（ポートフォリオ）やメダル価値への直撃を匂わせる「引き」を作れ。
例:「でもソル、このモンスターを放置すると、私たちのサイフに直撃する大問題が発生するわよ…！」
解説を完結させない。ボケとツッコミの開幕で終わり、読者が続きを気にする状態にせよ。`;

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

  // ── ターン3：ソル（深掘り・白熱） ─────────────────────────────────────────
  const solFollowPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第3発言】ルーナの危機感・ツッコミを受けて白熱させよ。「でも実は…」と切り返し、RPG比喩を続け、まだ答えが出ない問いを1つ残せ。`;

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

  // ── ターン4：ルーナ（締め＋リベンジ／防衛策） ───────────────────────────────
  if (!options?.skipFollowUp) {
    const lunaClosingPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第4発言・締め】結論を1行で言い切り、「逃げ足の鱗」「次の弱点」「防衛策」など次回につながる一言を残せ。読者が深掘りしたくなる余韻で終わる。`;

    const lunaClosing = await callOpenAiSystem(
      buildLunaSystemPrompt(lunaPersonalityBlock, relationshipBlock),
      lunaClosingPrompt,
      models.lunaModel,
    );
    if (lunaClosing.ok) {
      created.push(
        createSystemMessage("luna", lunaClosing.text, {
          provider: LUNA_SYSTEM_PROVIDER,
          model: lunaClosing.model,
          modelLabel: `Azure OpenAI · ${lunaClosing.model}`,
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
