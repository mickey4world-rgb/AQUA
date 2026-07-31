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

function calcCrowdScore(dateStr: string, park: DisneyParkKey): number {
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
): DisneyDatePrediction {
  const today = getJstToday();
  const score = calcCrowdScore(dateStr, park);
  const crowdLevel = scoreToCrowdLevel(score);
  const factors = collectDayFactors(dateStr);
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

export function predictCalendarMonth(
  park: DisneyParkKey,
  year: number,
  month: number,
): DisneyCalendarMonth {
  const today = getJstToday();
  const days = getMonthDays(year, month).map((dateStr): DisneyCalendarDay => {
    const prediction = predictCrowdForDate(park, dateStr);
    return {
      date: dateStr,
      crowdLevel: prediction.crowdLevel,
      crowdLabel: prediction.crowdLabel,
      estimatedWait: prediction.estimatedWait,
      isToday: dateStr === today,
      isPast: compareDateStr(dateStr, today) < 0,
      isFuture: compareDateStr(dateStr, today) > 0,
      factors: prediction.factors.slice(0, 2),
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
