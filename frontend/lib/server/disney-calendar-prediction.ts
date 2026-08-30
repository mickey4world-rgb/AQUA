import { DISNEY_PARKS } from "@/lib/disney-constants";
import { crowdLevelLabels } from "@/lib/disney-utils";
import {
  compareDateStr,
  getJstToday,
  getMonthDays,
  getMonthStartWeekday,
  isHolidayEve,
  isJapanHoliday,
  parseJstDate,
} from "@/lib/disney-holidays";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import type {
  CrowdLevel,
  DisneyCalendarDay,
  DisneyCalendarMonth,
  DisneyDatePrediction,
  DisneyParkKey,
} from "@/lib/types/disney";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function inRange(month: number, day: number, from: [number, number], to: [number, number]): boolean {
  const value = month * 100 + day;
  return value >= from[0] * 100 + from[1] && value <= to[0] * 100 + to[1];
}

function collectPeriodFactors(month: number, day: number): string[] {
  const factors: string[] = [];
  if (inRange(month, day, [4, 29], [5, 6])) factors.push("ゴールデンウィーク");
  if (inRange(month, day, [3, 20], [4, 7])) factors.push("春休みシーズン");
  if (inRange(month, day, [7, 20], [8, 31])) factors.push("夏休みシーズン");
  if (inRange(month, day, [8, 13], [8, 16])) factors.push("お盆");
  if (inRange(month, day, [12, 23], [12, 31])) factors.push("クリスマス・年末");
  if (inRange(month, day, [1, 1], [1, 3])) factors.push("正月三が日");
  if (month === 10 && day >= 15) factors.push("ハロウィーンシーズン");
  if (month === 2 && day >= 1 && day <= 14) factors.push("比較的落ち着きやすい時期");
  return factors;
}

function collectDayFactors(dateStr: string): string[] {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  const factors: string[] = [];

  if (isJapanHoliday(dateStr)) factors.push("祝日");
  if (isHolidayEve(dateStr)) factors.push("祝前日");
  if (dayOfWeek === 0) factors.push("日曜日");
  else if (dayOfWeek === 6) factors.push("土曜日");
  else if (dayOfWeek === 5) factors.push("金曜日");
  else factors.push("平日");

  factors.push(...collectPeriodFactors(month, day));
  return [...new Set(factors)];
}

function getHistoricalPatternModifier(dateStr: string): { delta: number; label?: string } {
  const { month, dayOfWeek } = parseJstDate(dateStr);
  let delta = 0;
  let label: string | undefined;

  // 昨年同時期の TDR 混雑傾向（曜日×シーズンの経験則）
  if (month === 3 && dayOfWeek >= 5) {
    delta += 8;
    label = "昨年同時期（春休み前）の混雑傾向";
  }
  if (month === 4 && dayOfWeek >= 5) {
    delta += 10;
    label = "昨年同時期（春休み後半）の混雑傾向";
  }
  if (month === 11 && dayOfWeek >= 1 && dayOfWeek <= 4) {
    delta -= 8;
    label = "昨年同時期（11月平日）の落ち着き傾向";
  }
  if (month === 12 && dayOfWeek === 6) {
    delta += 12;
    label = "昨年同時期（12月土曜）の混雑傾向";
  }
  if (month === 8 && dayOfWeek === 0) {
    delta += 10;
    label = "昨年同時期（夏休み日曜）の混雑傾向";
  }

  return { delta, label };
}

function crowdLevelToScoreDelta(level: CrowdLevel): number {
  const map: Record<CrowdLevel, number> = {
    low: -12,
    moderate: 0,
    high: 10,
    extreme: 18,
  };
  return map[level];
}

function getRecentFlowModifier(
  dateStr: string,
  today: string,
  liveBias: number,
): { delta: number; label?: string } {
  if (liveBias === 0) return { delta: 0 };
  const todayParsed = parseJstDate(today);
  const targetParsed = parseJstDate(dateStr);
  if (targetParsed.year !== todayParsed.year || targetParsed.month !== todayParsed.month) {
    return { delta: 0 };
  }
  if (compareDateStr(dateStr, today) <= 0) return { delta: 0 };

  // 同月の未来日は、直近の実測混雑で微調整
  const sameDow = targetParsed.dayOfWeek === todayParsed.dayOfWeek;
  const delta = sameDow ? liveBias : Math.round(liveBias * 0.5);
  return {
    delta,
    label: delta > 0 ? "直近の来園者・待ち時間の高止まり" : "直近の来園者・待ち時間の低調",
  };
}

function calcCrowdScore(
  dateStr: string,
  park: DisneyParkKey,
  liveBias = 0,
): number {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 28;

  if (dayOfWeek === 6) score += 22;
  else if (dayOfWeek === 0) score += 26;
  else if (dayOfWeek === 5) score += 10;

  if (isJapanHoliday(dateStr)) score += 28;
  if (isHolidayEve(dateStr)) score += 14;

  if (inRange(month, day, [4, 29], [5, 6])) score += 32;
  if (inRange(month, day, [3, 20], [4, 7])) score += 16;
  if (inRange(month, day, [7, 20], [8, 31])) score += 22;
  if (inRange(month, day, [8, 13], [8, 16])) score += 14;
  if (inRange(month, day, [12, 23], [12, 31])) score += 24;
  if (inRange(month, day, [1, 1], [1, 3])) score += 26;
  if (month === 10 && day >= 15) score += 12;

  if (month === 2 && dayOfWeek >= 1 && dayOfWeek <= 5 && !isJapanHoliday(dateStr)) {
    score -= 10;
  }
  if (month === 11 && dayOfWeek >= 1 && dayOfWeek <= 4 && !isJapanHoliday(dateStr)) {
    score -= 6;
  }

  if (park === "tdl") score += 3;

  score += getHistoricalPatternModifier(dateStr).delta;
  score += getRecentFlowModifier(dateStr, getJstToday(), liveBias).delta;

  return Math.max(0, Math.min(100, score));
}

function scoreToCrowdLevel(score: number): CrowdLevel {
  if (score < 32) return "low";
  if (score < 52) return "moderate";
  if (score < 72) return "high";
  return "extreme";
}

function estimateAverageWait(level: CrowdLevel, park: DisneyParkKey): number {
  const base: Record<CrowdLevel, number> = {
    low: 18,
    moderate: 33,
    high: 52,
    extreme: 78,
  };
  return base[level] + (park === "tdl" ? 2 : 0);
}

function buildDescription(
  park: DisneyParkKey,
  dateStr: string,
  level: CrowdLevel,
  factors: string[],
): string {
  const { dayOfWeek } = parseJstDate(dateStr);
  const dayLabel = DAY_LABELS[dayOfWeek];
  const factorText = factors.slice(0, 3).join("・");
  return `${DISNEY_PARKS[park].nameJa}は ${dateStr}（${dayLabel}）${factorText ? `の${factorText}を踏まえ` : "を踏まえ"}、${crowdLevelLabels[level]}程度と予測されます。`;
}

function buildVisitTips(level: CrowdLevel, factors: string[]): string[] {
  const tips: string[] = [];

  if (level === "extreme" || level === "high") {
    tips.push("開園30分前到着を目標に、人気アトラクションを午前中に集中させましょう。");
    tips.push("ショーやパレード時間帯はアトラクション待ちが伸びやすいため、移動計画を事前に立てておくと効率的です。");
  } else if (level === "moderate") {
    tips.push("比較的バランスの取れた日。午前は人気アトラクション、午後はショーや食事を組み合わせやすいです。");
  } else {
    tips.push("空きやすい日。定番アトラクションも比較的短い待ち時間で回れる可能性が高いです。");
  }

  if (factors.includes("土曜日") || factors.includes("日曜日") || factors.includes("祝日")) {
    tips.push("週末・祝日は再入園やホテル宿泊者も多く、午後から混雑が加速しやすい傾向があります。");
  }
  if (factors.some((f) => f.includes("夏休み") || f.includes("ゴールデンウィーク"))) {
    tips.push("長期休暇シーズンはイベント目的の来園者も多いため、公式アプリでショー時間を確認しておきましょう。");
  }
  if (factors.includes("平日")) {
    tips.push("平日来園なら、午後の待ち時間ピーク前に主要アトラクションを終わらせるのがおすすめです。");
  }

  tips.push("天候によって待ち時間は変動します。雨の日は屋内アトラクション中心に回ると効率的な場合があります。");
  return tips;
}

export function predictCrowdForDate(
  park: DisneyParkKey,
  dateStr: string,
  liveBias = 0,
): DisneyDatePrediction {
  const today = getJstToday();
  const score = calcCrowdScore(dateStr, park, liveBias);
  const crowdLevel = scoreToCrowdLevel(score);
  const factors = collectDayFactors(dateStr);
  const hist = getHistoricalPatternModifier(dateStr);
  const recent = getRecentFlowModifier(dateStr, today, liveBias);
  if (hist.label) factors.push(hist.label);
  if (recent.label) factors.push(recent.label);
  const estimatedWait = estimateAverageWait(crowdLevel, park);
  const isToday = dateStr === today;
  const isPast = compareDateStr(dateStr, today) < 0;
  const isFuture = compareDateStr(dateStr, today) > 0;

  return {
    date: dateStr,
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    crowdLevel,
    crowdLabel: crowdLevelLabels[crowdLevel],
    crowdScore: score,
    estimatedWait,
    factors,
    description: buildDescription(park, dateStr, crowdLevel, factors),
    visitTips: buildVisitTips(crowdLevel, factors),
    isToday,
    isPast,
    isFuture,
    mode: isToday ? "live" : "forecast",
  };
}

export async function predictCalendarMonth(
  park: DisneyParkKey,
  year: number,
  month: number,
): Promise<DisneyCalendarMonth> {
  const today = getJstToday();
  let liveBias = 0;

  try {
    const { buildParkCrowdStatus } = await import("@/lib/server/disney-analysis");
    const status = await buildParkCrowdStatus(park);
    liveBias = crowdLevelToScoreDelta(status.crowdLevel);
  } catch {
    liveBias = 0;
  }

  const days = getMonthDays(year, month).map((dateStr): DisneyCalendarDay => {
    const prediction = predictCrowdForDate(park, dateStr, liveBias);
    const breakdown = buildCrowdBreakdown(dateStr, park);
    return {
      date: dateStr,
      crowdLevel: prediction.crowdLevel,
      crowdLabel: prediction.crowdLabel,
      crowdScore: breakdown.total,
      estimatedWait: prediction.estimatedWait,
      isToday: dateStr === today,
      isPast: compareDateStr(dateStr, today) < 0,
      isFuture: compareDateStr(dateStr, today) > 0,
      factors: prediction.factors.slice(0, 3),
      breakdown,
    };
  });

  return {
    park,
    year,
    month,
    monthLabel: `${year}年${month}月`,
    startWeekday: getMonthStartWeekday(year, month),
    days,
    today,
  };
}

export const CALENDAR_MAX_MONTHS_AHEAD = 6;

export function isMonthNavigable(year: number, month: number): boolean {
  const today = parseJstDate(getJstToday());
  const currentIndex = today.year * 12 + today.month;
  const targetIndex = year * 12 + month;
  return targetIndex >= currentIndex && targetIndex <= currentIndex + CALENDAR_MAX_MONTHS_AHEAD;
}
