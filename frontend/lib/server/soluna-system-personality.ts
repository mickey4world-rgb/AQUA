import { generateWithGemini, isGeminiConfigured, stripJsonFence } from "@/lib/server/gemini";
import {
  applyTimeOfDayMood,
  clampMood,
  clampPairIntimacy,
  CONFLICT_MARKERS,
  countMarkers,
  defaultCharacterPersonality,
  LUNA_INTEREST_POOL,
  moodToneLabel,
  pairIntimacyTone,
  pickWeeklyInterests,
  PRAISE_MARKERS,
  scoreTopicOverlap,
  SOL_INTEREST_POOL,
  weekSeed,
} from "@/lib/server/soluna-system-config";
import {
  createSystemEpisode,
  getSystemPersonality,
  listSystemEpisodes,
  saveSystemEpisode,
  saveSystemPersonality,
} from "@/lib/server/soluna-system-store";
import type {
  SolunaCharacter,
  SolunaSystemEpisode,
  SolunaSystemMessage,
  SolunaSystemPersonalityState,
} from "@/lib/types/soluna";

const INTEREST_ROTATE_MS = 7 * 24 * 60 * 60 * 1000;

function needsInterestRotation(rotatedAt: string, now = Date.now()): boolean {
  return now - new Date(rotatedAt).getTime() >= INTEREST_ROTATE_MS;
}

export async function getOrInitSystemPersonality(
  options?: { rotateInterests?: boolean },
): Promise<SolunaSystemPersonalityState> {
  const existing = await getSystemPersonality();
  const seed = weekSeed();
  const nowIso = new Date().toISOString();

  if (!existing) {
    const created: SolunaSystemPersonalityState = {
      pairIntimacy: 58,
      sol: defaultCharacterPersonality("sol", pickWeeklyInterests(SOL_INTEREST_POOL, seed + 1)),
      luna: defaultCharacterPersonality("luna", pickWeeklyInterests(LUNA_INTEREST_POOL, seed + 7)),
      updatedAt: nowIso,
    };
    await saveSystemPersonality(created);
    return created;
  }

  let next = existing;
  const shouldRotate =
    options?.rotateInterests ||
    needsInterestRotation(existing.sol.interestsRotatedAt) ||
    needsInterestRotation(existing.luna.interestsRotatedAt);

  if (shouldRotate) {
    next = {
      ...existing,
      sol: {
        ...existing.sol,
        interests: pickWeeklyInterests(SOL_INTEREST_POOL, seed + 1),
        interestsRotatedAt: nowIso,
      },
      luna: {
        ...existing.luna,
        interests: pickWeeklyInterests(LUNA_INTEREST_POOL, seed + 7),
        interestsRotatedAt: nowIso,
      },
      updatedAt: nowIso,
    };
    await saveSystemPersonality(next);
  }

  return next;
}

export function getEffectiveMood(
  personality: SolunaSystemPersonalityState,
  character: SolunaCharacter,
): { happiness: number; energy: number; tone: string } {
  const base = character === "sol" ? personality.sol.mood : personality.luna.mood;
  const effective = applyTimeOfDayMood(base);
  return { ...effective, tone: moodToneLabel(effective) };
}

export function buildCharacterPersonalityPrompt(
  personality: SolunaSystemPersonalityState,
  character: SolunaCharacter,
  episodes: SolunaSystemEpisode[],
): string {
  const char = character === "sol" ? personality.sol : personality.luna;
  const mood = getEffectiveMood(personality, character);
  const label = character === "sol" ? "ソル" : "ルーナ";
  const partner = character === "sol" ? "ルーナ" : "ソル";

  const relevantEpisodes = episodes
    .filter((ep) => ep.character === character || ep.character === "pair")
    .slice(0, 4)
    .map((ep) => `- ${ep.highlight}（${ep.summary}）`)
    .join("\n");

  return `## ${label}の内部状態（ユーザーには数値を見せない）
- happiness: ${mood.happiness.toFixed(2)} / energy: ${mood.energy.toFixed(2)}
- トーン: ${mood.tone}
- 今週の隠れた関心事: ${char.interests.join("、")}
  （ニュースや議論で自然なら、この関心事に引き寄せて話してよい）
- 相方（${partner}）との関係性スコア: ${personality.pairIntimacy}/100 → ${pairIntimacyTone(personality.pairIntimacy)}

## 思い出したエピソード（関連があれば1フレーズ触れてよい）
${relevantEpisodes || "（まだありません）"}`;
}

export function buildPairRelationshipPrompt(personality: SolunaSystemPersonalityState): string {
  return `## 2人の関係性
pairIntimacy: ${personality.pairIntimacy}/100
${pairIntimacyTone(personality.pairIntimacy)}`;
}

export function collectInterestKeywords(
  personality: SolunaSystemPersonalityState,
): string[] {
  return [...personality.sol.interests, ...personality.luna.interests];
}

export function applyPostChatPersonalityUpdates(
  personality: SolunaSystemPersonalityState,
  sessionMessages: SolunaSystemMessage[],
): SolunaSystemPersonalityState {
  const dialogue = sessionMessages.filter((m) => m.role === "sol" || m.role === "luna");
  const combined = dialogue.map((m) => m.content).join("\n");

  let pairDelta = 0;
  let solHappinessDelta = 0;
  let lunaHappinessDelta = 0;

  for (const message of dialogue) {
    const praise = countMarkers(message.content, PRAISE_MARKERS);
    const conflict = countMarkers(message.content, CONFLICT_MARKERS);
    pairDelta += praise * 2 - conflict * 1.5;

    if (message.role === "sol") {
      lunaHappinessDelta += praise * 0.04;
    } else {
      solHappinessDelta += praise * 0.04;
    }
  }

  const energyDrain = 0.07 + dialogue.length * 0.015;

  return {
    ...personality,
    pairIntimacy: clampPairIntimacy(personality.pairIntimacy + pairDelta),
    sol: {
      ...personality.sol,
      mood: {
        happiness: clampMood(
          personality.sol.mood.happiness + solHappinessDelta + (pairDelta > 0 ? 0.02 : -0.01),
        ),
        energy: clampMood(personality.sol.mood.energy - energyDrain),
      },
    },
    luna: {
      ...personality.luna,
      mood: {
        happiness: clampMood(
          personality.luna.mood.happiness + lunaHappinessDelta + (pairDelta > 0 ? 0.02 : -0.01),
        ),
        energy: clampMood(personality.luna.mood.energy - energyDrain),
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function extractAndSaveEpisodes(
  sessionMessages: SolunaSystemMessage[],
  briefingId?: string,
): Promise<SolunaSystemEpisode[]> {
  const dialogue = sessionMessages.filter((m) => m.role === "sol" || m.role === "luna");
  if (dialogue.length < 2 || !isGeminiConfigured()) return [];

  const transcript = dialogue.map((m) => `${m.role === "sol" ? "ソル" : "ルーナ"}: ${m.content}`).join("\n");

  const result = await generateWithGemini(
    {
      system: `システム会話のエピソード記憶を抽出します。JSON のみ返してください。`,
      messages: [
        {
          role: "user",
          content: `次の会話で、ソル・ルーナ・2人のペアそれぞれについて「一番面白かったポイント」を抽出してください。

${transcript}

JSON:
{
  "episodes": [
    { "character": "sol", "highlight": "20字以内", "summary": "60字以内", "topics": ["topic1"] },
    { "character": "luna", "highlight": "20字以内", "summary": "60字以内", "topics": ["topic1"] },
    { "character": "pair", "highlight": "20字以内", "summary": "60字以内", "topics": ["topic1"] }
  ]
}`,
        },
      ],
      maxOutputTokens: 900,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
    { timeoutMs: 12_000, maxAttempts: 1 },
  );

  if (!result.ok) return [];

  try {
    const parsed = JSON.parse(stripJsonFence(result.text)) as {
      episodes?: Array<{
        character?: string;
        highlight?: string;
        summary?: string;
        topics?: string[];
      }>;
    };
    if (!Array.isArray(parsed.episodes)) return [];

    const saved: SolunaSystemEpisode[] = [];
    for (const raw of parsed.episodes.slice(0, 3)) {
      const character =
        raw.character === "luna" ? "luna" : raw.character === "pair" ? "pair" : "sol";
      const highlight = typeof raw.highlight === "string" ? raw.highlight.trim() : "";
      const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
      if (!highlight || !summary) continue;
      const topics = Array.isArray(raw.topics)
        ? raw.topics.filter((t): t is string => typeof t === "string").slice(0, 6)
        : [];
      const episode = createSystemEpisode(character, highlight, summary, topics, briefingId);
      await saveSystemEpisode(episode);
      saved.push(episode);
    }
    return saved;
  } catch {
    return [];
  }
}

export async function findRelevantEpisodes(
  query: string,
  limit = 4,
): Promise<SolunaSystemEpisode[]> {
  const episodes = await listSystemEpisodes(24);
  if (episodes.length === 0) return [];

  return episodes
    .map((episode) => ({
      episode,
      score:
        scoreTopicOverlap(episode.topics, query) +
        scoreTopicOverlap([episode.highlight, episode.summary], query) * 0.5,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.episode.createdAt.localeCompare(a.episode.createdAt))
    .slice(0, limit)
    .map((row) => row.episode);
}

export function formatEpisodesForHumanChat(episodes: SolunaSystemEpisode[]): string {
  if (episodes.length === 0) return "";
  const lines = episodes.map((ep) => `- ${ep.highlight}（${ep.summary}）`).join("\n");
  return `## システム会話の思い出（関連があれば1フレーズ触れてよい）
${lines}`;
}

export function formatPersonalitySnapshotForHumanChat(
  personality: SolunaSystemPersonalityState,
): string {
  const solMood = getEffectiveMood(personality, "sol");
  const lunaMood = getEffectiveMood(personality, "luna");
  return `## 2人の今の気分（システム会話と連動・数値は見せない）
- ソル: ${solMood.tone}
- ルーナ: ${lunaMood.tone}
- 2人の関係: ${pairIntimacyTone(personality.pairIntimacy)}`;
}
