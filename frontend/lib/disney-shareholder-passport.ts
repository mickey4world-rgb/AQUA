import { parseJstDate } from "@/lib/disney-holidays";
import { inMonthDayRange } from "@/lib/disney-crowd-extra-factors";

/**
 * オリエンタルランド株主用パスポートの配布・有効期限サイクル。
 * 枚数は公開の厳密値ではなく、権利株数帯・特別優待の規模から相対強度（1〜10）を置く。
 * 出典の目安: OLC IR「株主優待制度」（3末・9末基準 / 6月・12月配布）
 */
export type OlcShareholderCycle = {
  id: string;
  label: string;
  /** 相対配布規模（大きいほど来園押し上げ） */
  volume: number;
  /** 発送・配布が始まる日 */
  distributeFrom: string;
  /** 配布完了の目安 */
  distributeTo: string;
  /** 利用開始（配布開始と同時とみなす） */
  validFrom: string;
  /** 有効期限 */
  validTo: string;
  special?: boolean;
};

/** 年次で繰り返す通常優待（月日ベース）＋既知の特別優待 */
const FIXED_SPECIAL_CYCLES: OlcShareholderCycle[] = [
  {
    id: "special-2025-65th",
    label: "創立65周年特別優待",
    volume: 9,
    distributeFrom: "2025-12-10",
    distributeTo: "2025-12-25",
    validFrom: "2025-12-10",
    validTo: "2026-08-31",
    special: true,
  },
  {
    id: "special-2026-30th-listing",
    label: "上場30周年特別優待",
    volume: 10,
    distributeFrom: "2026-12-10",
    distributeTo: "2026-12-25",
    validFrom: "2026-12-10",
    validTo: "2027-08-31",
    special: true,
  },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00+09:00`);
  const b = new Date(`${to}T12:00:00+09:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 通常優待: 3末基準→6月上旬配布 / 9末基準→12月中旬配布、有効約1年 */
function buildRecurringCycles(forYear: number): OlcShareholderCycle[] {
  return [
    {
      id: `spring-${forYear}`,
      label: `${forYear}年3末基準・春配布`,
      // 500株〜が中心（3末のみ500株枠あり）→ 中規模
      volume: 5,
      distributeFrom: dateStr(forYear, 6, 1),
      distributeTo: dateStr(forYear, 6, 20),
      validFrom: dateStr(forYear, 6, 1),
      validTo: dateStr(forYear + 1, 5, 31),
    },
    {
      id: `autumn-${forYear}`,
      label: `${forYear}年9末基準・冬配布`,
      // 大口＋長期保有(100株3年)追加分 → やや大規模
      volume: 7,
      distributeFrom: dateStr(forYear, 12, 10),
      distributeTo: dateStr(forYear, 12, 25),
      validFrom: dateStr(forYear, 12, 10),
      validTo: dateStr(forYear + 1, 11, 30),
    },
  ];
}

function cyclesTouchingYear(year: number): OlcShareholderCycle[] {
  const recurring = [
    ...buildRecurringCycles(year - 1),
    ...buildRecurringCycles(year),
    ...buildRecurringCycles(year + 1),
  ];
  return [...recurring, ...FIXED_SPECIAL_CYCLES];
}

function activeCyclesOn(dateStrValue: string): OlcShareholderCycle[] {
  const year = Number(dateStrValue.slice(0, 4));
  return cyclesTouchingYear(year).filter(
    (cycle) =>
      compareYmd(dateStrValue, cycle.validFrom) >= 0 &&
      compareYmd(dateStrValue, cycle.validTo) <= 0,
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 株主優待パスポートの配布数規模・配布直後・期限直前から混雑スコアを推定。
 */
export function scoreShareholderPassport(dateStrValue: string): {
  score: number;
  label: string;
} {
  const { month, day, dayOfWeek } = parseJstDate(dateStrValue);
  const active = activeCyclesOn(dateStrValue);
  let score = 10;
  const tags: string[] = [];

  if (active.length === 0) {
    // 権利確定前後は「これから使う」意識で予約・来園計画が増えやすい
    if (inMonthDayRange(month, day, [3, 20], [4, 10]) || inMonthDayRange(month, day, [9, 20], [10, 10])) {
      score += 6;
      tags.push("株主権利確定前後");
    }
    return {
      score: clamp(score),
      label: tags.length ? tags.join("・") : "株主優待・平常",
    };
  }

  const top = [...active].sort((a, b) => b.volume - a.volume)[0];
  const volumeBoost = Math.round(top.volume * 4.5);
  score += volumeBoost;
  tags.push(top.label);
  tags.push(`配布規模${top.volume}/10`);

  if (top.special) {
    score += 10;
    tags.push("特別優待流通");
  }

  // 配布直後（到着〜約3週間）は使い始め需要
  const daysSinceDistribute = daysBetween(top.distributeFrom, dateStrValue);
  if (daysSinceDistribute >= 0 && daysSinceDistribute <= 21) {
    score += 14;
    tags.push("株主パス配布直後");
  }

  // 期限前30日は使い切りラッシュ（週末は特に）
  const daysToExpiry = daysBetween(dateStrValue, top.validTo);
  if (daysToExpiry >= 0 && daysToExpiry <= 30) {
    score += dayOfWeek >= 5 || dayOfWeek === 0 ? 22 : 14;
    tags.push("株主パス期限前");
  } else if (daysToExpiry > 30 && daysToExpiry <= 60) {
    score += 8;
    tags.push("株主パス期限2か月前");
  }

  // 有効期間中の平日は株主来園が相対的に増えやすい
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    score += 6;
    tags.push("株主平日来園");
  }

  // 複数サイクルが重なる時期（例: 通常＋特別）
  if (active.length >= 2) {
    score += 8;
    tags.push("優待パス重複流通");
  }

  return { score: clamp(score), label: tags.join("・") };
}

export function listShareholderCyclesForDate(dateStrValue: string): OlcShareholderCycle[] {
  return activeCyclesOn(dateStrValue);
}
