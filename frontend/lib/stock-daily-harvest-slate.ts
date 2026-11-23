/**
 * 少額売買専用枠（毎日入れ替え）の純関数。
 * 前日までの騰落・流動性・枠適格で採点し、上位 N 件を維持しつつ最大 R 件だけ入れ替える。
 */
import {
  STOCK_DAILY_HARVEST_MAX_REPLACEMENTS,
  STOCK_DAILY_HARVEST_SLATE_SIZE,
  STOCK_WEEKLY_OVERHEAT_CHANGE_PCT,
} from "@/lib/stock-trade-constants";
import {
  isMonthlyHarvestCandidate,
  yenAtOnePercentMove,
} from "@/lib/stock-monthly-harvest";
import type { StockJpUniverseTier } from "@/lib/stock-jp-universe";

export type DailyHarvestScoreInput = {
  code: string;
  name: string;
  price: number;
  /** 前日比など、直近の騰落率（%） */
  changePct: number;
  avgVolume?: number | null;
  tier: StockJpUniverseTier;
  heldShares: number;
  /** 昨日の枠に入っていたか */
  wasOnSlate: boolean;
};

export type DailyHarvestScore = {
  code: string;
  name: string;
  price: number;
  changePct: number;
  score: number;
  reasons: string[];
  yenAt1pct: number;
  eligible: boolean;
  heldShares: number;
  tier: StockJpUniverseTier;
};

export type DailyHarvestSlatePlan = {
  dayId: string;
  size: number;
  codes: string[];
  kept: string[];
  added: string[];
  removed: string[];
  scores: DailyHarvestScore[];
  summary: string;
};

const TIER_BONUS: Record<StockJpUniverseTier, number> = {
  core: 14,
  "core-mid": 8,
  satellite: 6,
  thin: -12,
  "watch-only": -6,
};

export function scoreDailyHarvestCandidate(
  input: DailyHarvestScoreInput,
): DailyHarvestScore {
  const price = Number(input.price) || 0;
  const changePct = Number(input.changePct) || 0;
  const eligible = isMonthlyHarvestCandidate(price);
  const yenAt1pct = yenAtOnePercentMove(price);
  const reasons: string[] = [];
  let score = 0;

  if (!eligible) {
    score -= 200;
    reasons.push("少額枠の単元条件外");
  } else {
    score += 40;
    reasons.push(`1%動 約 ${yenAt1pct.toLocaleString("ja-JP")}円`);
  }

  const tierBonus = TIER_BONUS[input.tier] ?? 0;
  score += tierBonus;
  if (tierBonus !== 0) {
    reasons.push(tierBonus > 0 ? `枠 ${input.tier}` : `枠 ${input.tier}（減点）`);
  }

  // 前日までの状況: 押し目を優遇、過熱は外す（的中率向上）
  if (changePct <= -5) {
    score += 18;
    reasons.push(`押し目 ${changePct.toFixed(1)}%`);
  } else if (changePct <= -2) {
    score += 12;
    reasons.push(`小押し目 ${changePct.toFixed(1)}%`);
  } else if (changePct >= STOCK_WEEKLY_OVERHEAT_CHANGE_PCT) {
    score -= 22;
    reasons.push(`過熱 +${changePct.toFixed(1)}%（枠から外し寄り）`);
  } else if (changePct >= 3) {
    score -= 8;
    reasons.push(`上昇継続 +${changePct.toFixed(1)}%`);
  } else {
    score += 4;
    reasons.push("前日ほぼフラット");
  }

  const vol = input.avgVolume;
  if (typeof vol === "number" && vol > 0) {
    if (vol >= 500_000) {
      score += 10;
      reasons.push("流動性厚め");
    } else if (vol >= 100_000) {
      score += 5;
      reasons.push("流動性まずまず");
    } else if (vol < 30_000) {
      score -= 12;
      reasons.push("出来高低め");
    }
  }

  if (input.heldShares > 0) {
    score += 28;
    reasons.push(`保有 ${input.heldShares}株 — 枠維持優先`);
  }

  if (input.wasOnSlate && eligible) {
    score += 6;
    reasons.push("前日枠の継続ボーナス");
  }

  return {
    code: input.code,
    name: input.name,
    price,
    changePct,
    score,
    reasons,
    yenAt1pct,
    eligible,
    heldShares: input.heldShares,
    tier: input.tier,
  };
}

/**
 * 上位から枠を埋め、前日枠からは最大 maxReplacements 件だけ入れ替える。
 * 保有銘柄は必ず残す。
 */
export function planDailyHarvestSlate(input: {
  scores: DailyHarvestScore[];
  previousCodes: string[];
  dayId: string;
  size?: number;
  maxReplacements?: number;
}): DailyHarvestSlatePlan {
  const size = input.size ?? STOCK_DAILY_HARVEST_SLATE_SIZE;
  const maxReplacements =
    input.maxReplacements ?? STOCK_DAILY_HARVEST_MAX_REPLACEMENTS;
  const ranked = [...input.scores]
    .filter((s) => s.eligible)
    .sort((a, b) => b.score - a.score);

  const held = ranked.filter((s) => s.heldShares > 0).map((s) => s.code);
  const previousSet = new Set(input.previousCodes);
  const next: string[] = [...held];

  // 前日枠のうち、まだ上位に残るものを優先継続
  const previousStillGood = ranked
    .filter(
      (s) =>
        previousSet.has(s.code) &&
        !next.includes(s.code) &&
        s.score >= 20,
    )
    .map((s) => s.code);
  for (const code of previousStillGood) {
    if (next.length >= size) break;
    next.push(code);
  }

  // 空きを新規上位で埋める（入れ替え上限）
  let replacements = 0;
  for (const s of ranked) {
    if (next.length >= size) break;
    if (next.includes(s.code)) continue;
    const isNew = !previousSet.has(s.code);
    if (isNew && replacements >= maxReplacements) continue;
    next.push(s.code);
    if (isNew) replacements += 1;
  }

  // まだ空きがあれば入れ替え上限を超えても埋める（初回・候補不足時）
  for (const s of ranked) {
    if (next.length >= size) break;
    if (next.includes(s.code)) continue;
    next.push(s.code);
  }

  const nextSet = new Set(next);
  const kept = input.previousCodes.filter((c) => nextSet.has(c));
  const added = next.filter((c) => !previousSet.has(c));
  const removed = input.previousCodes.filter((c) => !nextSet.has(c));

  const summary = `少額売買枠 ${next.length}/${size}件 · 継続${kept.length} · 新規${added.length} · 除外${removed.length}（上限入替 ${maxReplacements}）`;

  return {
    dayId: input.dayId,
    size,
    codes: next,
    kept,
    added,
    removed,
    scores: ranked,
    summary,
  };
}

export function jstDayId(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
