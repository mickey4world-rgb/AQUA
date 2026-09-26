import { crowdLevelLabels } from "@/lib/disney-utils";
import {
  compareDateStr,
  getJstToday,
  getMonthDays,
  getMonthStartWeekday,
  parseJstDate,
} from "@/lib/disney-holidays";
import { buildUsjCrowdBreakdown } from "@/lib/server/usj-crowd-breakdown";
import { USJ_PARK } from "@/lib/usj-constants";
import type {
  CrowdLevel,
  DisneyCalendarDay,
  DisneyCalendarMonth,
  DisneyDatePrediction,
} from "@/lib/types/disney";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const monthCache = new Map<string, DisneyCalendarMonth>();

function scoreToLevel(score: number): CrowdLevel {
  if (score >= 78) return "extreme";
  if (score >= 58) return "high";
  if (score >= 38) return "moderate";
  return "low";
}

function estimatedWait(score: number): number {
  return Math.round(12 + score * 0.85);
}

function visitTips(level: CrowdLevel): string[] {
  if (level === "extreme" || level === "high") {
    return [
      "開園直後に任天堂／ハリー・ポッターを優先",
      "長蛇の列はスキップしショーで時間を作る",
      "エクスプレスは本当に必要な施設だけ",
    ];
  }
  return [
    "人気施設を午前に2件",
    "午後はサンリオ／スヌーピーで休憩",
    "夜のライトアップ前に写真スポットへ",
  ];
}

export function isUsjMonthNavigable(year: number, month: number): boolean {
  const today = getJstToday();
  const { year: ty, month: tm } = parseJstDate(today);
  const min = ty * 12 + tm - 3;
  const max = ty * 12 + tm + 6;
  const value = year * 12 + month;
  return value >= min && value <= max;
}

export function predictUsjCrowdForDate(dateStr: string): DisneyDatePrediction {
  const breakdown = buildUsjCrowdBreakdown(dateStr);
  const crowdLevel = scoreToLevel(breakdown.total);
  const today = getJstToday();
  const isToday = dateStr === today;
  const isPast = compareDateStr(dateStr, today) < 0;
  const isFuture = compareDateStr(dateStr, today) > 0;
  const { dayOfWeek } = parseJstDate(dateStr);
  const factors = [
    breakdown.labels.calendar,
    breakdown.labels.seasonal,
    breakdown.labels.event,
    breakdown.labels.regionalPassport,
    breakdown.labels.schoolK12,
  ].filter(Boolean);

  return {
    date: dateStr,
    park: "usj" as DisneyDatePrediction["park"],
    parkName: USJ_PARK.nameJa,
    crowdLevel,
    crowdLabel: crowdLevelLabels[crowdLevel],
    crowdScore: breakdown.total,
    estimatedWait: estimatedWait(breakdown.total),
    factors,
    description: `${DAY_LABELS[dayOfWeek]}・${factors.slice(0, 3).join("／")}`,
    visitTips: visitTips(crowdLevel),
    isToday,
    isPast,
    isFuture,
    mode: isToday ? "live" : "forecast",
  };
}

export async function predictUsjCalendarMonth(
  year: number,
  month: number,
): Promise<DisneyCalendarMonth> {
  const key = `usj:${year}-${month}`;
  const cached = monthCache.get(key);
  if (cached) return cached;

  const today = getJstToday();
  const days: DisneyCalendarDay[] = getMonthDays(year, month).map((dateStr) => {
    const prediction = predictUsjCrowdForDate(dateStr);
    const breakdown = buildUsjCrowdBreakdown(dateStr);
    return {
      date: dateStr,
      crowdLevel: prediction.crowdLevel,
      crowdLabel: prediction.crowdLabel,
      crowdScore: prediction.crowdScore,
      estimatedWait: prediction.estimatedWait,
      isToday: dateStr === today,
      isPast: compareDateStr(dateStr, today) < 0,
      isFuture: compareDateStr(dateStr, today) > 0,
      factors: prediction.factors.slice(0, 3),
      breakdown,
      accuracy: null,
    };
  });

  const payload: DisneyCalendarMonth = {
    park: "usj" as DisneyCalendarMonth["park"],
    year,
    month,
    monthLabel: `${year}年${month}月`,
    startWeekday: getMonthStartWeekday(year, month),
    days,
    today,
    accuracySummary: {
      evaluatedDays: 0,
      hits: 0,
      hitRate: 0,
      meanAbsScoreError: 0,
      latestReviewSummary:
        "USJはライブ待ち蓄積中。ディズニー反省（祝日二重加点抑制・園固有パス非転用）を初版に反映済み。",
    },
  };
  monthCache.set(key, payload);
  return payload;
}
