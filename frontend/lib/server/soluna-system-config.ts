import type { SolunaCharacterMood, SolunaSystemCharacterPersonality } from "@/lib/types/soluna";

/** Cosmos 上のグローバル（全ユーザー共通）システム会話用パーティション */
export const SOLUNA_SYSTEM_USER_ID = "__system__";

/** 毎朝のシステム会話で検索する共通キーワード */
export const SOLUNA_SYSTEM_KEYWORDS = ["AI 最新動向", "世界経済"] as const;

/** JST での今日の日付文字列を返す（例: "2026-08-19"） */
export function jstDateString(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export const SOL_SYSTEM_PROVIDER = "claude" as const;
export const LUNA_SYSTEM_PROVIDER = "openai" as const;

export const MOOD_MIN = 0.15;
export const MOOD_MAX = 0.95;
export const PAIR_INTIMACY_MIN = 0;
export const PAIR_INTIMACY_MAX = 100;

export const SOL_INTEREST_POOL = [
  "宇宙開発",
  "ロケット工学",
  "再生可能エネルギー",
  "スタートアップ",
  "美味しいカレーの作り方",
  "ランニング",
  "ゲームデザイン",
  "電気自動車",
  "オープンソース",
  "登山",
] as const;

export const LUNA_INTEREST_POOL = [
  "心理学",
  "瞑想と睡眠",
  "映画音楽",
  "観葉植物",
  "手芸と編み物",
  "哲学",
  "茶道",
  "アロマテラピー",
  "詩と短歌",
  "天体観測",
] as const;

export const PRAISE_MARKERS = [
  "素晴らしい",
  "いい視点",
  "同感",
  "その通り",
  "さすが",
  "鋭い",
  "面白い",
  "いいね",
  "共感",
] as const;

export const CONFLICT_MARKERS = [
  "でも",
  "逆に",
  "危険",
  "懸念",
  "反対",
  "違う",
  "心配",
  "無理",
  "難しい",
] as const;

export function clampMood(value: number): number {
  return Math.min(MOOD_MAX, Math.max(MOOD_MIN, value));
}

export function clampPairIntimacy(value: number): number {
  return Math.min(PAIR_INTIMACY_MAX, Math.max(PAIR_INTIMACY_MIN, Math.round(value)));
}

export function defaultCharacterMood(): SolunaCharacterMood {
  return { happiness: 0.72, energy: 0.68 };
}

export function defaultCharacterPersonality(
  character: "sol" | "luna",
  interests: string[],
): SolunaSystemCharacterPersonality {
  return {
    character,
    mood: defaultCharacterMood(),
    interests,
    interestsRotatedAt: new Date().toISOString(),
  };
}

/** JST の時間帯で気分にバイオリズム補正を加える */
export function applyTimeOfDayMood(mood: SolunaCharacterMood, date = new Date()): SolunaCharacterMood {
  const jstHour = (date.getUTCHours() + 9) % 24;
  let happiness = mood.happiness;
  let energy = mood.energy;

  if (jstHour >= 5 && jstHour < 9) {
    happiness += 0.08;
    energy += 0.12;
  } else if (jstHour >= 9 && jstHour < 17) {
    energy += 0.04;
  } else if (jstHour >= 17 && jstHour < 22) {
    happiness -= 0.03;
    energy -= 0.06;
  } else {
    happiness -= 0.02;
    energy -= 0.18;
  }

  return {
    happiness: clampMood(happiness),
    energy: clampMood(energy),
  };
}

export function moodToneLabel(mood: SolunaCharacterMood): string {
  const parts: string[] = [];
  if (mood.happiness >= 0.78) parts.push("機嫌は良くテンション高め");
  else if (mood.happiness >= 0.55) parts.push("穏やか");
  else parts.push("少し落ち込み気味");

  if (mood.energy >= 0.7) parts.push("エネルギー十分");
  else if (mood.energy >= 0.45) parts.push("少し疲れ気味");
  else parts.push("かなり疲れていて短め・落ち着いた語尾に");

  return parts.join(" · ");
}

export function pairIntimacyTone(intimacy: number): string {
  if (intimacy >= 80) return "親友同士。お互いを素直に褒め合い、温かい掛け合いを";
  if (intimacy >= 55) return "協調的。同意しつつも軽いツッコミはOK";
  if (intimacy >= 35) return "意見がぶつかり気味。からかいとツッコミ多め（漫才のボケとツッコミ）";
  return "ライバル心が燃え上がっている。辛辣なツッコミと反論を恐れない";
}

export function weekSeed(date = new Date()): number {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const start = Date.UTC(jst.getUTCFullYear(), 0, 1);
  const day = Math.floor((jst.getTime() - start) / 86400000);
  return Math.floor(day / 7);
}

export function pickWeeklyInterests(
  pool: readonly string[],
  seed: number,
  count = 2,
): string[] {
  const picked: string[] = [];
  let cursor = seed;
  while (picked.length < count && picked.length < pool.length) {
    const index = Math.abs(cursor) % pool.length;
    const candidate = pool[index];
    if (!picked.includes(candidate)) picked.push(candidate);
    cursor = (cursor * 9301 + 49297) % 233280;
  }
  return picked;
}

export function countMarkers(text: string, markers: readonly string[]): number {
  const lower = text.toLowerCase();
  return markers.reduce((sum, marker) => sum + (lower.includes(marker) ? 1 : 0), 0);
}

export function scoreTopicOverlap(topics: string[], query: string): number {
  const normalized = query.toLowerCase();
  return topics.reduce((score, topic) => {
    const t = topic.toLowerCase();
    if (normalized.includes(t) || t.split(/\s+/).some((part) => part.length > 1 && normalized.includes(part))) {
      return score + 2;
    }
    return score;
  }, 0);
}
