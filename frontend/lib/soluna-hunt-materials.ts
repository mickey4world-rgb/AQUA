/**
 * Soluna 討伐／Note 用ニュース材料の選定。
 * 不変条件: 3件のうち少なくとも2件は注目度 ≥80（WORKS ダイジェストにその水準があるとき）。
 */
import {
  NEWS_SEARCH_CATEGORIES,
  NEWS_SEARCH_CATEGORY_LABEL,
  type NewsSearchCategory,
  type NewsSearchDigest,
  type NewsSearchItem,
} from "@/lib/types/works-news-search";

/** Note／討伐に載せる件数 */
export const SOLUNA_HUNT_SLOT_COUNT = 3;

/** 「非常に注目が高い」閾値（ユーザー契約・WORKS 表示と揃える） */
export const SOLUNA_HUNT_HIGH_ATTENTION_MIN = 80;

/** 3件中、高注目を優先する枠数 */
export const SOLUNA_HUNT_HIGH_ATTENTION_SLOTS = 2;

export type SolunaHuntSeedItem = {
  keyword: string;
  title: string;
  summary: string;
  titleJa?: string;
  summaryJa?: string;
  attentionScore: number;
  sourceUrl?: string;
  publishedAt?: string;
  category: NewsSearchCategory;
};

function categoryKeyword(category: NewsSearchCategory): string {
  // Soluna 既存キーワードと WORKS カテゴリ表示名を接続
  if (category === "ai") return "AI 最新動向";
  if (category === "economy") return "世界経済";
  if (category === "security") return "セキュリティ";
  return NEWS_SEARCH_CATEGORY_LABEL[category] ?? category;
}

function flattenDigestItems(digest: NewsSearchDigest): Array<
  NewsSearchItem & { category: NewsSearchCategory }
> {
  return NEWS_SEARCH_CATEGORIES.flatMap((category) =>
    (digest.categories[category] ?? []).map((item) => ({
      ...item,
      category: item.category || category,
    })),
  );
}

function toSeed(
  item: NewsSearchItem & { category: NewsSearchCategory },
): SolunaHuntSeedItem {
  return {
    keyword: categoryKeyword(item.category),
    title: item.title,
    summary: item.explanation || item.summary,
    titleJa: item.titleJa?.trim() || undefined,
    summaryJa:
      item.summaryJa?.trim() ||
      (item.explanation?.trim()
        ? item.explanation.trim().slice(0, 160)
        : undefined),
    attentionScore: Math.max(
      1,
      Math.min(100, Math.round(item.attentionScore ?? 0)),
    ),
    sourceUrl: item.sources.find((s) => s.url)?.url,
    publishedAt: item.publishedAt,
    category: item.category,
  };
}

/**
 * 全カテゴリから注目度順に選び、高注目枠を先に埋める。
 * WORKS UI と同じ attentionScore をそのまま使う（再推定で薄めない）。
 */
export function selectSolunaHuntSeedItems(
  digest: NewsSearchDigest,
  options?: {
    slotCount?: number;
    highMin?: number;
    highSlots?: number;
  },
): SolunaHuntSeedItem[] {
  const slotCount = options?.slotCount ?? SOLUNA_HUNT_SLOT_COUNT;
  const highMin = options?.highMin ?? SOLUNA_HUNT_HIGH_ATTENTION_MIN;
  const highSlots = options?.highSlots ?? SOLUNA_HUNT_HIGH_ATTENTION_SLOTS;

  const pool = flattenDigestItems(digest)
    .filter((item) => Boolean(item.title?.trim()) && Boolean(item.summary?.trim() || item.explanation?.trim()))
    .map(toSeed)
    .sort((a, b) => b.attentionScore - a.attentionScore);

  if (pool.length === 0) return [];

  const selected: SolunaHuntSeedItem[] = [];
  const used = new Set<string>();
  const keyOf = (s: SolunaHuntSeedItem) =>
    `${s.category}|${s.title}|${s.sourceUrl ?? ""}`;

  // 1) 高注目枠を先に埋める
  for (const item of pool) {
    if (selected.length >= highSlots) break;
    if (item.attentionScore < highMin) continue;
    selected.push(item);
    used.add(keyOf(item));
  }

  // 2) 残り枠は注目度の高い順で埋める（高注目が足りなければ次点）
  for (const item of pool) {
    if (selected.length >= slotCount) break;
    const k = keyOf(item);
    if (used.has(k)) continue;
    selected.push(item);
    used.add(k);
  }

  return selected.slice(0, slotCount);
}

export function countHighAttentionSeeds(
  seeds: Array<{ attentionScore?: number }>,
  highMin = SOLUNA_HUNT_HIGH_ATTENTION_MIN,
): number {
  return seeds.filter((s) => (s.attentionScore ?? 0) >= highMin).length;
}

export function digestHighAttentionCount(
  digest: NewsSearchDigest,
  highMin = SOLUNA_HUNT_HIGH_ATTENTION_MIN,
): number {
  return flattenDigestItems(digest).filter(
    (item) => (item.attentionScore ?? 0) >= highMin,
  ).length;
}

/**
 * オラクル: ダイジェストに高注目が2件以上ある日は、選定結果も2件以上必須。
 */
export function solunaHuntMaterialsMeetContract(
  seeds: Array<{ attentionScore?: number }>,
  digestHighCount: number,
  options?: { highMin?: number; highSlots?: number; slotCount?: number },
): { ok: boolean; highCount: number; reason?: string } {
  const highMin = options?.highMin ?? SOLUNA_HUNT_HIGH_ATTENTION_MIN;
  const highSlots = options?.highSlots ?? SOLUNA_HUNT_HIGH_ATTENTION_SLOTS;
  const slotCount = options?.slotCount ?? SOLUNA_HUNT_SLOT_COUNT;
  const highCount = countHighAttentionSeeds(seeds, highMin);

  if (seeds.length === 0) {
    return { ok: false, highCount: 0, reason: "材料ゼロ" };
  }
  if (seeds.length > slotCount) {
    return {
      ok: false,
      highCount,
      reason: `材料が ${seeds.length} 件（上限 ${slotCount}）`,
    };
  }
  if (digestHighCount >= highSlots && highCount < highSlots) {
    return {
      ok: false,
      highCount,
      reason: `ダイジェストに注目度≥${highMin}が${digestHighCount}件あるのに選定は${highCount}件`,
    };
  }
  return { ok: true, highCount };
}
