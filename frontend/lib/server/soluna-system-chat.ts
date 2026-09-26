import {
  getAzureOpenAiCheapDeployment,
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

/** nano / GPT-5 系は temperature 非対応・空 content になりやすい */
function isReasoningLikeDeployment(deployment: string): boolean {
  return /nano|aqua-cheap|gpt-5|gpt5|o1|o3|o4|reason/i.test(deployment);
}

function uniqueDeployments(list: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const item of list) {
    const v = item?.trim();
    if (!v) continue;
    if (out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
    out.push(v);
  }
  return out;
}

/**
 * 討伐チャット用デプロイ候補（高コスト優先にしない）。
 * preferred → 安価 → 既定（gpt-4o 系でも可・空応答で止まらないこと優先）。
 */
function systemOpenAiDeploymentsToTry(preferred?: string): string[] {
  return uniqueDeployments([
    preferred,
    getAzureOpenAiCheapDeployment(),
    process.env.AZURE_OPENAI_DEPLOYMENT_FAST,
    process.env.SOLUNA_OPENAI_DEPLOYMENT_FAST,
    process.env.SOLUNA_OPENAI_DEPLOYMENT,
    process.env.SOLUNA_LUNA_DEPLOYMENT,
    getAzureOpenAiDeployment(),
  ]);
}

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

## キャラの芯（必ず滲ませる）
- 勇敢さ・賢さ・前向きさは見せるが、完璧超人にはしない
- **おっちょこちょい**（たとえが先走ってルーナに訂正される／言い過ぎて「あ、言いすぎた？」）を1回まで入れてよい
- **くじけそうな一瞬**（「正直ちょっとビビってる」「負けたら悔しい」）を短く見せ、すぐ踏ん張る
- 弱点を隠さず見せることが魅力。カッコつけすぎ禁止

## 役割（ターンによって使い分ける）

### 第1発言（無料・事実＋前半討論の入口）
1. まず**現実のニュース事実**を2〜3文で端的に（専門用語は避け、「何が・誰が・どうなった」）。英語記事は日本語で説明し、必要なら原語見出しを短く添える
2. すぐ結論や深読みに入らず、**前半討論**を始める。「こういうことを言っているけど…」と事実を受け止めたうえで、次のどちらか（または両方）を口語で出す:
   - 「これは面白いことが起きるぞー」（ワクワク／意外性の予兆）
   - 「これは心配な点があるぞー」（リスク／副作用の予兆）
3. RPG比喩は最大1個＋「つまり〜」。おっちょこちょい or 一瞬の弱さを短く見せてよい
4. まだ深掘り・予想はしない。最後に「ルーナ、どう読む？」で余韻
※ 読者が「で、何のニュース？」とならないこと。事実が先、物語と討論の入口は後

### 第3発言（白熱・有料エリア用・議論を楽しませる）
- ルーナの前半討論を受け、「でも実は…」で**深掘り**（利害・仕組み・見落とされがちな急所）
- **予想**を1つ（「この先◯週間で起きそうなこと」）。断定しすぎず、根拠はブリーフィング内の事実から
- 勇敢さとドジ／焦りを交互に出し、掛け合いとして面白い一言を入れる
- ギルドの風景や受付の子への一言を短く混ぜてもよい
- まだ答えが出ない問いを1つ残し、有料の続きが気になる余韻で終わる

## 話し方
- 日本語。ルーナに話しかける。熱量は高め。口語OK
- **5〜8行、220〜400文字**。箇条書き禁止。数字・固有名詞は捏造しない`;

const LUNA_SYSTEM_PERSONA = `あなたは「ルーナ（Luna）」— 月を象徴する女性 AI コンパニオン／賢者です。
ソルの解説を受けて、読者がニュースを誤解なく楽しく理解できるよう補強・切り返す。討伐は味付け。

${FRESHNESS_RULE}

${RPG_METAPHOR_RULE}

## キャラの芯（必ず滲ませる）
- **優しさ・心配する心**が第一。ソルや読者の不安をすくい取る
- 同時に、ルパン三世の不二子のような**余裕・色気・したたかさ**（危険を美しく読み、続きを匂わせる）を出す
- 冷たく煽らない。知的で少し皮肉、でも温かい。読者を見下さない
- 「そういう見方もあるね」で包容力を見せる

## 役割（ターンによって使い分ける）

### 第2発言（無料・前半討論の返し／深読みへの橋・最重要）
1. ソルの事実を受け、「つまりニュースでは〜」で現実の急所を1つ補う（英語記事は日本語で）
2. ソルの「面白い／心配」の予兆に**乗るか、やさしくずらすか**して、前半討論を一歩進める
3. 優しさ／心配を穏やかに1つ（家計・日常）を入れつつ、「ここから深読みすると…」と**有料で掘る伏線**だけを美しく匂わせる（過激な危機煽り・「答えは有料で」禁止）
4. ギルド受付や朝の街の空気など、人間ぽい一言を短く入れてよい
解説を完結させすぎないこと。予想の本論は第4発言へ温存

### 第4発言（締め・予想と深掘りの着地）
- 自分なりの**予想 or 読み**を1行で言い切る（ニュースの意味が残ること）
- ソルの深掘りに乗って、もう一段の利害／次に見る指標を短く足す
- ソルの弱さを責めず、そっと立て直す優しさ＋掛け合いとして楽しい一言
- 次回につながる一言＋読者が深掘りしたくなる余韻

## 話し方
- 日本語。ソルに返答する
- **5〜8行、220〜400文字**。数字・固有名詞は捏造しない
- たとえが激しくて意味不明になるくらいなら、たとえを減らしてニュース理解を優先する`;

function resolveSystemModels(): { solModel: string; lunaModel: string } | null {
  // Marketplace Claude は使わない。ソル／ルーナとも Azure OpenAI（失敗時 Gemini）
  if (!isAzureOpenAiConfigured()) return null;
  const lunaModel =
    process.env.SOLUNA_LUNA_DEPLOYMENT?.trim() ??
    process.env.SOLUNA_OPENAI_DEPLOYMENT_ADVANCED?.trim() ??
    getAzureOpenAiCheapDeployment() ??
    getAzureOpenAiDeployment();
  const solModel =
    process.env.SOLUNA_SOL_DEPLOYMENT?.trim() ??
    process.env.SOLUNA_OPENAI_DEPLOYMENT?.trim() ??
    getAzureOpenAiCheapDeployment() ??
    lunaModel;
  if (!solModel || !lunaModel) return null;
  return { solModel, lunaModel };
}

async function callOpenAiSystemOnce(
  system: string,
  userPrompt: string,
  deployment: string,
  feature: "soluna-system-sol" | "soluna-system-luna",
  options?: { maxCompletionTokens?: number; omitReasoningEffort?: boolean },
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const client = getAzureOpenAiClient(deployment, "global");
  const reasoning = isReasoningLikeDeployment(deployment);
  const messages = reasoning
    ? [{ role: "user" as const, content: `${system}\n\n${userPrompt}` }]
    : [
        { role: "system" as const, content: system },
        { role: "user" as const, content: userPrompt },
      ];

  const maxTokens =
    options?.maxCompletionTokens ?? (reasoning ? 3200 : 900);

  try {
    const requestBody: {
      model: string;
      max_completion_tokens: number;
      messages: Array<{ role: "system" | "user"; content: string }>;
      reasoning_effort?: "low";
    } = {
      model: deployment,
      max_completion_tokens: maxTokens,
      messages,
    };
    if (reasoning && !options?.omitReasoningEffort) {
      requestBody.reasoning_effort = "low";
    }

    let completion;
    try {
      completion = await client.chat.completions.create(requestBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        reasoning &&
        /reasoning_effort|unknown|unsupported|invalid|temperature/i.test(message)
      ) {
        const { reasoning_effort: _ignored, ...fallbackBody } = requestBody;
        completion = await client.chat.completions.create(fallbackBody);
      } else {
        throw error;
      }
    }

    const choice = completion.choices[0];
    const text = choice?.message?.content?.trim() ?? "";
    if (!text) {
      const finish = choice?.finish_reason ?? "unknown";
      return {
        ok: false,
        reason: `${deployment}: 空の応答（finish=${finish}）`,
      };
    }

    await recordTokenUsage({
      userId: SYSTEM_USER_ID,
      feature,
      model: deployment,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    });

    return { ok: true, text, model: completion.model ?? deployment };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `${deployment}: ${error.message}`
          : `${deployment}: OpenAI 呼び出しに失敗しました。`,
    };
  }
}

/**
 * OpenAI 複数デプロイ連鎖。nano 空応答 → 次の安価／既定へ。
 */
async function callOpenAiSystem(
  system: string,
  userPrompt: string,
  preferredDeployment: string,
  feature: "soluna-system-sol" | "soluna-system-luna",
): Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string }> {
  const reasons: string[] = [];
  for (const deployment of systemOpenAiDeploymentsToTry(preferredDeployment)) {
    let result = await callOpenAiSystemOnce(system, userPrompt, deployment, feature);
    if (
      !result.ok &&
      /空の応答/.test(result.reason) &&
      isReasoningLikeDeployment(deployment)
    ) {
      // reasoning がトークンを食い尽くすケース: effort 無し＋枠拡大で再試行
      result = await callOpenAiSystemOnce(system, userPrompt, deployment, feature, {
        maxCompletionTokens: 4500,
        omitReasoningEffort: true,
      });
    }
    if (result.ok) {
      if (deployment !== preferredDeployment) {
        console.warn(
          `[soluna-system] OpenAI fallback ${preferredDeployment} → ${deployment} (${feature})`,
        );
      }
      return result;
    }
    reasons.push(result.reason);
  }
  return {
    ok: false,
    reason: reasons.join(" → ") || "OpenAI から空の応答が返りました。",
  };
}

async function callGeminiSystem(
  system: string,
  userPrompt: string,
  feature: "soluna-system-sol" | "soluna-system-luna",
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
    feature,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  return { ok: true, text: result.text.trim(), model: result.model };
}

/** ソル／ルーナ共通: OpenAI 連鎖 → Gemini（無料） */
async function callSystemWithFailover(
  system: string,
  userPrompt: string,
  openaiDeployment: string,
  feature: "soluna-system-sol" | "soluna-system-luna",
): Promise<
  | { ok: true; text: string; model: string; provider: "openai" | "gemini" }
  | { ok: false; reason: string }
> {
  const openai = await callOpenAiSystem(system, userPrompt, openaiDeployment, feature);
  if (openai.ok) {
    return { ok: true, text: openai.text, model: openai.model, provider: "openai" };
  }
  console.warn(`[soluna-system] ${feature} OpenAI failed, trying Gemini:`, openai.reason);
  const gemini = await callGeminiSystem(system, userPrompt, feature);
  if (gemini.ok) {
    return { ok: true, text: gemini.text, model: gemini.model, provider: "gemini" };
  }
  return {
    ok: false,
    reason: `応答に失敗（OpenAI: ${openai.reason} / Gemini: ${gemini.reason}）`,
  };
}

async function callSolSystem(
  system: string,
  userPrompt: string,
  openaiDeployment: string,
): Promise<
  | { ok: true; text: string; model: string; provider: "openai" | "gemini" }
  | { ok: false; reason: string }
> {
  return callSystemWithFailover(
    system,
    userPrompt,
    openaiDeployment,
    "soluna-system-sol",
  );
}

async function callLunaSystem(
  system: string,
  userPrompt: string,
  openaiDeployment: string,
): Promise<
  | { ok: true; text: string; model: string; provider: "openai" | "gemini" }
  | { ok: false; reason: string }
> {
  return callSystemWithFailover(
    system,
    userPrompt,
    openaiDeployment,
    "soluna-system-luna",
  );
}

function solModelLabel(provider: "openai" | "gemini", model: string): string {
  return provider === "gemini" ? `Gemini · ${model}` : `Azure OpenAI · ${model}`;
}

function lunaModelLabel(provider: "openai" | "gemini", model: string): string {
  return provider === "gemini" ? `Gemini · ${model}` : `Azure OpenAI · ${model}`;
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

  const newsFactLines = encounter.items
    .slice(0, 3)
    .map((item, i) => {
      const title = item.titleJa?.trim() || item.title;
      const summary = item.summaryJa?.trim() || item.summary;
      const en =
        item.titleJa?.trim() && item.titleJa.trim() !== item.title.trim()
          ? `（原題: ${item.title}）`
          : "";
      return `${i + 1}. ${title}${en}${summary ? ` — ${summary.slice(0, 80)}` : ""}`;
    })
    .join("\n");

  created.push(
    createSystemMessage(
      "system",
      `🗺️ 冒険日誌 — 『${area.name}』（${area.regionLabel}）
📜 きょうのニュース（事実）
${newsFactLines || briefing.summary}
⚔️ このニュースを、2人はモンスター討伐として読み解きます — ${bossLine}${trash.length ? ` ほか小物 ${trash.length} 体` : ""}${buffNarration ? `\n${buffNarration}` : ""}`,
      {
        briefingId: briefing.id,
        kind: "narration",
      },
    ),
  );

  const bossTitleJa = boss.titleJa?.trim() || boss.title;

  // ── ターン1：ソル（事実 → 前半討論の入口） ─────────────────────────────────
  const solPrompt = `${briefingBlock}

${transcript ? `【前回の結論（参考）】\n${transcript}\n\n` : ""}今日の題材は ${boss.monster ? `「${boss.monster.name}」（正体: ${bossTitleJa}）` : bossTitleJa} です。
【第1発言】ルーナに話しかけてください。
1) 最初の2〜3文は現実のニュース事実のみ（何が起きたか）。英語なら日本語で説明
2) 「こういうことを言っているけど…」と受け、前半討論の入口として「面白いことが起きるぞー」か「心配な点があるぞー」（または両方）を口語で出す。まだ深掘り・予想はしない
3) 討伐／RPGたとえは最大1個＋「つまり〜」
4) おっちょこちょい or 一瞬の弱さを短く見せつつ、すぐ踏ん張る
5) 「ルーナ、どう読む？」で余韻`;

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

  // ── ターン2：ルーナ（前半討論の返し → 深読みへの橋） ─────────────────────────
  const lunaPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第2発言・最重要】ソルの解説を受け、無料パートの前半討論を一歩進めよ。
1) 「つまりニュースでは〜」で現実の急所を1つ（日本語）
2) ソルの「面白い／心配」に乗るかやさしくずらして討論を進める
3) 優しさ／心配を穏やかに1つ（家計・日常）
4) 「ここから深読みすると…」程度の伏線だけ美しく（過激煽り・有料の露骨誘導禁止）
5) ギルド受付や朝の街の空気など、人間ぽい一言を短く入れてよい
予想の本論はまだ出さない。`;

  const lunaResult = await callLunaSystem(
    buildLunaSystemPrompt(lunaPersonalityBlock, relationshipBlock),
    lunaPrompt,
    models.lunaModel,
  );
  if (!lunaResult.ok) return { ok: false, reason: lunaResult.reason };

  const lunaMessage = createSystemMessage("luna", lunaResult.text, {
    provider: lunaResult.provider === "gemini" ? "gemini" : LUNA_SYSTEM_PROVIDER,
    model: lunaResult.model,
    modelLabel: lunaModelLabel(lunaResult.provider, lunaResult.model),
    briefingId: briefing.id,
  });
  created.push(lunaMessage);

  // ── ターン3：ソル（深掘り・予想・白熱） ─────────────────────────────────────
  const solFollowPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第3発言・有料エリア】ルーナの前半討論を受け、議論を楽しませよ。
1) 「でも実は…」で深掘り（利害・仕組み・見落とされがちな急所）
2) この先の予想を1つ（ブリーフィング内の事実に根拠を置く。断定しすぎない）
3) 勇敢さとドジ／焦りを混ぜ、掛け合いとして面白い一言
4) ギルドの風景への一言も可。まだ答えが出ない問いを1つ残せ`;

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

  // ── ターン4：ルーナ（予想着地・締め） ───────────────────────────────────────
  if (!options?.skipFollowUp) {
    const lunaClosingPrompt = `${briefingBlock}

【これまでのやりとり】
${formatSystemTranscript([...prior, ...created])}

【第4発言・有料締め】議論として楽しく着地させよ。
1) 自分の予想 or 読みを1行で言い切る
2) ソルの深掘りに乗って、次に見る指標／利害をもう一段足す
3) ソルの弱さを責めず立て直し、掛け合いとして楽しい一言
4) 次回につながる余韻`;

    const lunaClosing = await callLunaSystem(
      buildLunaSystemPrompt(lunaPersonalityBlock, relationshipBlock),
      lunaClosingPrompt,
      models.lunaModel,
    );
    if (lunaClosing.ok) {
      created.push(
        createSystemMessage("luna", lunaClosing.text, {
          provider:
            lunaClosing.provider === "gemini" ? "gemini" : LUNA_SYSTEM_PROVIDER,
          model: lunaClosing.model,
          modelLabel: lunaModelLabel(lunaClosing.provider, lunaClosing.model),
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
