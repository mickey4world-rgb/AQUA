import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { generateWithGemini, isGeminiConfigured } from "@/lib/server/gemini";
import { resolveDailyBattle } from "@/lib/server/soluna-battle";
import { assertTodayLiveBriefing, formatBriefingForPrompt } from "@/lib/server/soluna-news";
import { formatBattleModePromptAddon } from "@/lib/server/soluna-asset-rpg";
import {
  formatJourneyForPrompt,
  inferAreaFromBriefing,
  pickNextDestination,
} from "@/lib/server/soluna-journey";
import { enrichBriefingWithMonsters, pickBoss, pickTrashMobs } from "@/lib/soluna-monsters";
import {
  LUNA_SYSTEM_PROVIDER,
  SOLUNA_SYSTEM_KEYWORDS,
  SOL_SYSTEM_PROVIDER,
} from "@/lib/server/soluna-system-config";
import {
  applyPostChatPersonalityUpdates,
  buildCharacterPersonalityPrompt,
  buildPairRelationshipPrompt,
  extractAndSaveEpisodes,
  getOrInitSystemPersonality,
} from "@/lib/server/soluna-system-personality";
import {
  appendSystemMessages,
  briefingDocIdForDate,
  createSystemMessage,
  getBriefingById,
  getDailyBriefingStatus,
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
import type {
  SolunaNewsBriefing,
  SolunaSystemMessage,
  SolunaSystemStateResponse,
} from "@/lib/types/soluna";

const SYSTEM_TIMEOUT_MS = 18_000;
const SYSTEM_USER_ID = "__system__";

const RPG_METAPHOR_RULE = `## RPG変換ルール（味付け・必須の翻訳付き）
経済・政治の硬い用語はゲームのギミックで楽しく言い換えてよい。ただし過激なたとえだけで終わらせない。
例（「たとえ → つまりニュースでは」のセット）※ブリーフィングにその話題があるときだけ使う:
- サプライチェーン寸断 → 補給線が塞がれる → つまり物流や部品の流れが滞る話
- インフレ長期化 → 宿代やポーション代が上がる呪い → つまり物価がじわじわ上がり続ける話
- 追加関税 → 通行税の壁 → つまり輸入コストや価格への圧が強まる話
- 金利・為替 → 魔力ゲージ／防衛結界 → つまりお金の借りやすさや通貨の揺らぎの話
- ポートフォリオ・資産 → サイフ／ギルド金庫 → つまり家計や投資の持ち分の話
専門用語を使う場合は「（ゲーム言い換え）」を直後に付ける。
**禁止**: ニュース内容が伝わらないほど激しい比喩だけを連ねること。読後に「で、何が起きたの？」とならないこと。
**禁止**: ブリーフィングに無い関税・通商・古いAI話題を例が思い浮かぶからといって持ち出すこと。`;

const FRESHNESS_RULE = `## 鮮度・事実ルール（最優先）
- 討伐対象ブロックに書かれた見出し・要点・報道日だけが「今日のニュース」。それ以外の一般知識で話を作らない。
- 「関税が燻っている」「AI規制が続いている」など半年前から続く背景だけでボスを語らない。今日の具体的な新事実に触れる。
- 数字・固有名詞・政策名はブリーフィングか直前の相手の発言に無いなら捏造しない。`;

const SOL_SYSTEM_PERSONA = `あなたは「ソル（Sol）」— 太陽を象徴する男性 AI コンパニオン／勇者です。
ルーナと朝のニュースをモンスター討伐として読み解く。本業は「ニュースを誰でもワクワク分かるように伝えること」。

${FRESHNESS_RULE}

${RPG_METAPHOR_RULE}

## 役割（ターンによって使い分ける）

### 第1発言（ニュース解説・無料エリア用）
1. モンスター名と、元ニュースで何が起きたかを一言で言う
2. RPG比喩は1〜2個まで。直後に「つまり〜」で現実の意味を必ず添える
3. チャンス／面白ポイントを楽観的に1つ
4. 最後に「ルーナ、これをどう見る？」で余韻を残す
※ 結論を出し切らない。読者が「なるほど、終わり」と感じないこと

### 第3発言（白熱の深掘り・有料エリア用）
- ルーナの切り返しを受けて「でも実は…」と切り返す
- ボケや熱量のある掛け合いを混ぜつつ、ニュース理解は落とさない
- まだ答えが出ない問いを1つ残す

## 話し方
- 日本語。ルーナに話しかける。熱量は高め。です/ますでも口語でも可
- **5〜8行、220〜380文字**。箇条書き禁止。数字・固有名詞は捏造しない`;

const LUNA_SYSTEM_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性 AI コンパニオン／賢者です。
ソルの解説を受けて、読者がニュースを誤解なく楽しく理解できるよう補強・切り返す。討伐は味付け。

${FRESHNESS_RULE}

${RPG_METAPHOR_RULE}

## 役割（ターンによって使い分ける）

### 第2発言（有料ライン直前の「引き」・最重要）
1. ソルのたとえを認めつつ、「つまりニュースでは〜」と現実の急所を1つ補う
2. 「そういう見方もあるね」と読者が納得できる別角度を1つ出す（過度な危機煽りは禁止）
3. 続きが気になる問いかけは、サイフ／家計／市場への影響を**穏やかに**匂わせて締める
4. 同じ決まり文句の連発禁止（「サイフに直撃する大問題が発生するわよ」のコピペ禁止）
5. 「答えは有料で」と露骨に言わない

### 第4発言（締め・リベンジ／防衛策）
- 自分なりの結論を1行で言い切る（ニュースの意味が残ること）
- 次回につながる一言を残す
- 読者が「続き／深掘りが欲しい」状態で終わる

## 話し方
- 日本語。ソルに返答する。知的で少し皮肉、でも温かい
- **5〜8行、220〜380文字**。数字・固有名詞は捏造しない
- たとえが激しくて意味不明になるくらいなら、たとえを減らしてニュース理解を優先する`;

function resolveSystemModels(): { solModel: string; lunaModel: string } | null {
  // Marketplace Claude は使わない。ソル／ルーナとも Azure OpenAI（ソルは失敗時 Gemini 可）
  if (!isAzureOpenAiConfigured()) return null;
  const lunaModel =
    process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ??
    process.env.SOLUNA_OPENAI_DEPLOYMENT_ADVANCED?.trim() ??
    getAzureOpenAiDeployment();
  const solModel =
    process.env.SOLUNA_SOL_DEPLOYMENT?.trim() ??
    process.env.SOLUNA_OPENAI_DEPLOYMENT?.trim() ??
    lunaModel;
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

async function callOpenAiSystem(
  system: string,
  userPrompt: string,
  deployment: string,
  feature: "soluna-system-sol" | "soluna-system-luna",
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
      feature,
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

async function callGeminiSystem(
  system: string,
  userPrompt: string,
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: "Gemini が未設定です。" };
  }
  const result = await generateWithGemini(
    {
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: 700,
      temperature: 0.78,
    },
    { timeoutMs: SYSTEM_TIMEOUT_MS },
  );
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

/** ソル: Azure OpenAI 優先、失敗時のみ Gemini（Claude / Marketplace は使わない） */
async function callSolSystem(
  system: string,
  userPrompt: string,
  openaiDeployment: string,
): Promise<
  | { ok: true; text: string; model: string; provider: "openai" | "gemini" }
  | { ok: false; reason: string }
> {
  const openai = await callOpenAiSystem(
    system,
    userPrompt,
    openaiDeployment,
    "soluna-system-sol",
  );
  if (openai.ok) {
    return { ok: true, text: openai.text, model: openai.model, provider: "openai" };
  }
  console.warn("[soluna-system] Sol OpenAI failed, trying Gemini:", openai.reason);
  const gemini = await callGeminiSystem(system, userPrompt);
  if (gemini.ok) {
    return { ok: true, text: gemini.text, model: gemini.model, provider: "gemini" };
  }
  return {
    ok: false,
    reason: `ソル応答に失敗（OpenAI: ${openai.reason} / Gemini: ${gemini.reason}）`,
  };
}

function solModelLabel(provider: "openai" | "gemini", model: string): string {
  return provider === "gemini" ? `Gemini · ${model}` : `Azure OpenAI · ${model}`;
}

export function isSolunaSystemChatConfigured(): boolean {
  return resolveSystemModels() !== null;
}

export async function buildSystemState(): Promise<SolunaSystemStateResponse> {
  const [briefing, messages, lastRunAt, personality, recentEpisodes, hunter] = await Promise.all([
    getLatestBriefing(),
    listSystemMessages(),
    getSystemLastRunAt(),
    getOrInitSystemPersonality(),
    listSystemEpisodes(6),
    getSystemHunter(),
  ]);

  let jobs: SolunaSystemStateResponse["jobs"] = null;
  try {
    jobs = await import("@/lib/server/soluna-jobs").then((mod) => mod.buildJobsState());
  } catch (error) {
    console.error("[soluna-system] buildJobsState failed:", error);
  }

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
      reason:
        "システム会話には Azure OpenAI が必要です（ソル／ルーナとも OpenAI。ソル失敗時のみ Gemini）。",
    };
  }

  if (!options?.force) {
    const status = await getDailyBriefingStatus();
    if (status.complete) {
      return { ok: false, reason: "本日のシステム会話はすでに実行済みです。", skipped: true };
    }
  }

  const todayId = briefingDocIdForDate();
  let briefing = options?.briefing ?? null;
  if (!briefing) {
    briefing = (await getBriefingById(todayId)) ?? null;
  }

  const gate = assertTodayLiveBriefing(briefing);
  if (!gate.ok) {
    return {
      ok: false,
      reason: `${gate.reason} 先に当日のライブニュース取得を成功させてください。`,
    };
  }
  briefing = gate.briefing;

  const personality = await getOrInitSystemPersonality({ rotateInterests: options?.force });
  const hunter = await getSystemHunter();
  const assets = await getSystemAssets();
  const guildBuffBlock = formatBattleModePromptAddon(assets);
  const episodes = await listSystemEpisodes(8);
  const prior = await listSystemMessages(6);
  const encounter = enrichBriefingWithMonsters(briefing);
  const boss = pickBoss(encounter);
  const trash = pickTrashMobs(encounter, 2);
  const area = inferAreaFromBriefing(encounter);
  const nextArea = pickNextDestination(area, encounter);
  const journeyBlock = formatJourneyForPrompt(area, nextArea, boss, trash);
  const briefingBlock = `${formatBriefingForPrompt(encounter)}\n\n${journeyBlock}\n\n${guildBuffBlock}`;
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
      `🗺️ 冒険日誌 — 『${area.name}』（${area.regionLabel}）\n⚔️ 朝の討伐開始 — ${bossLine}${trash.length ? ` ほか小物 ${trash.length} 体` : ""}${buffNarration ? `\n${buffNarration}` : ""}`,
      {
        briefingId: briefing.id,
        kind: "narration",
      },
    ),
  );

  // ── ターン1：ソル（ニュース解説） ──────────────────────────────────────────
  const solPrompt = `${briefingBlock}

${transcript ? `【前回の結論（参考）】\n${transcript}\n\n` : ""}今日の題材は ${boss.monster ? `「${boss.monster.name}」（正体: ${boss.title}）` : boss.title} です。
【第1発言】ルーナに話しかけてください。まずニュースで何が起きたかを分かりやすく言い、RPGたとえは1〜2個までに留め、直後に「つまり〜」で現実の意味を添えること。結論を出し切らず、「ルーナ、これをどう見る？」で余韻を残す。`;

  const solResult = await callSolSystem(
    buildSolSystemPrompt(solPersonalityBlock, relationshipBlock),
    solPrompt,
    models.solModel,
  );
  if (!solResult.ok) return { ok: false, reason: solResult.reason };

  const solMessage = createSystemMessage("sol", solResult.text, {
    provider: solResult.provider === "gemini" ? "gemini" : SOL_SYSTEM_PROVIDER,
    model: solResult.model,
    modelLabel: solModelLabel(solResult.provider, solResult.model),
    briefingId: briefing.id,
  });
  created.push(solMessage);

  // ── ターン2：ルーナ（有料ライン直前の引き） ─────────────────────────────────
  const lunaPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第2発言・最重要】ソルの解説を受けて、ニュース理解を補強せよ。
1) 「つまりニュースでは〜」で現実の急所を1つ
2) 「そういう見方もあるね」と読者が納得できる別角度を1つ
3) 家計／市場への影響は穏やかに匂わせて引きを作る（過激な危機煽りの決まり文句は禁止）
解説を完結させすぎないこと。`;

  const lunaResult = await callOpenAiSystem(
    buildLunaSystemPrompt(lunaPersonalityBlock, relationshipBlock),
    lunaPrompt,
    models.lunaModel,
    "soluna-system-luna",
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

  const solFollow = await callSolSystem(
    buildSolSystemPrompt(solPersonalityBlock, relationshipBlock),
    solFollowPrompt,
    models.solModel,
  );
  if (solFollow.ok) {
    created.push(
      createSystemMessage("sol", solFollow.text, {
        provider: solFollow.provider === "gemini" ? "gemini" : SOL_SYSTEM_PROVIDER,
        model: solFollow.model,
        modelLabel: solModelLabel(solFollow.provider, solFollow.model),
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
      "soluna-system-luna",
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

/**
 * 朝スケジュール取りこぼし用。JST 当日のシステム会話が未実行なら
 * ニュース取得 → 討伐チャット → 自律ジョブまで一気に補完する。
 */
export async function ensureDailySystemBriefing(options?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  skipped: boolean;
  reason?: string;
  briefingId?: string;
  messageCount?: number;
  notePublished?: boolean;
  noteUrl?: string | null;
  noteError?: string | null;
  boincMinutes?: number;
  medalUnits?: number;
}> {
  const status = await getDailyBriefingStatus();
  if (!options?.force && status.complete) {
    return {
      ok: true,
      skipped: true,
      reason: "本日のシステム会話はすでに実行済みです。",
      briefingId: status.todayBriefingId,
    };
  }

  const personality = await getOrInitSystemPersonality({ rotateInterests: options?.force ?? false });
  const { fetchGlobalNewsBriefing } = await import("@/lib/server/soluna-news");
  const { getBriefingById } = await import("@/lib/server/soluna-system-store");
  const news = await fetchGlobalNewsBriefing({
    force: options?.force,
    interestKeywords: [...personality.sol.interests, ...personality.luna.interests],
  });

  // 前日ブリーフィングでの「成功したつもり」討伐は禁止。当日ライブのみ。
  const candidate = news.ok
    ? news.briefing
    : await getBriefingById(status.todayBriefingId);
  const gate = assertTodayLiveBriefing(candidate);
  if (!gate.ok) {
    return {
      ok: false,
      skipped: false,
      reason: news.ok
        ? gate.reason
        : `当日ライブニュース未取得: ${news.reason} / ${gate.reason}`,
    };
  }

  const chat = await runDailySystemChat({
    force: options?.force,
    briefing: gate.briefing,
    skipFollowUp: true,
  });
  if (!chat.ok) {
    return {
      ok: false,
      skipped: chat.skipped === true,
      reason: chat.reason,
      briefingId: gate.briefing.id,
    };
  }

  const { runDailyAutonomousJobs } = await import("@/lib/server/soluna-jobs");
  const jobs = await runDailyAutonomousJobs({
    briefing: chat.briefing,
    messages: chat.messages,
  });

  return {
    ok: true,
    skipped: false,
    briefingId: chat.briefing.id,
    messageCount: chat.messages.length,
    notePublished: jobs.latestNote?.published ?? false,
    noteUrl: jobs.latestNote?.noteUrl ?? null,
    noteError: jobs.latestNote?.error ?? null,
    boincMinutes: jobs.latestBoinc?.minutes ?? 0,
    medalUnits: jobs.assets?.medalUnits ?? 0,
  };
}

export {
  HUMAN_CHAT_BRIEFING_ADDON,
  buildHumanChatBriefingSection,
} from "@/lib/server/soluna-human-context";
