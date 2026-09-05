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
import {
  getAccuracyMapForMonth,
  summarizeAccuracy,
} from "@/lib/server/disney-accuracy";
import { loadCrowdAdjustments } from "@/lib/server/disney-crowd-adjustments";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { getLatestMonthlyReview } from "@/lib/server/disney-monthly-review";
import type {
  CrowdLevel,
  DisneyCalendarDay,
  DisneyCalendarMonth,
  DisneyDatePrediction,
  DisneyParkKey,
} from "@/lib/types/disney";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const monthCache = new Map<string, DisneyCalendarMonth>();

function inRange(month: number, day: number, from: [number, number], to: [number, number]): boolean {
  const value = month * 100 + day;
  return value >= from[0] * 100 + from[1] && value <= to[0] * 100 + to[1];
}

function collectPeriodFactors(month: number, day: number): string[] {
  const factors: string[] = [];
  if (inRange(month, day, [4, 29], [5, 6])) factors.push("ゴールデンウィーク");
  if (inRange(month, day, [3, 20], [4, 7])) factors.push("小中高・春休み");
  if (inRange(month, day, [2, 1], [4, 10])) factors.push("大学・春休み");
  if (inRange(month, day, [7, 20], [8, 31])) factors.push("小中高・夏休み");
  if (inRange(month, day, [7, 15], [9, 30])) factors.push("大学・夏休み");
  if (inRange(month, day, [8, 13], [8, 16])) factors.push("お盆");
  if (inRange(month, day, [12, 23], [12, 31])) factors.push("クリスマス・年末");
  if (inRange(month, day, [1, 1], [1, 3])) factors.push("正月三が日");
  if (inRange(month, day, [12, 26], [1, 7])) factors.push("小中高・冬休み");
  if (inRange(month, day, [3, 1], [5, 15])) factors.push("地域限定パスポート");
  if (inRange(month, day, [9, 1], [11, 30])) factors.push("地域限定パスポート");
  if (inRange(month, day, [6, 1], [6, 20])) factors.push("株主優待パス配布期");
  if (inRange(month, day, [12, 10], [12, 25])) factors.push("株主優待パス配布期");
  if (inRange(month, day, [5, 1], [5, 31])) factors.push("株主優待パス期限前");
  if (inRange(month, day, [8, 1], [8, 31])) factors.push("株主優待パス期限前");
  if (inRange(month, day, [11, 1], [11, 30])) factors.push("株主優待パス期限前");
  if (month === 10 && day >= 15) factors.push("ハロウィーンシーズン");
  if (month === 2 && day >= 1 && day <= 14) factors.push("比較的落ち着きやすい時期");
  if (inRange(month, day, [8, 20], [10, 15])) factors.push("台風シーズン");
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
  const breakdown = buildCrowdBreakdown(dateStr, park);
  const recent = getRecentFlowModifier(dateStr, getJstToday(), liveBias);
  return Math.max(0, Math.min(100, breakdown.total + recent.delta));
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
  if (factors.some((f) => f.includes("夏休み") || f.includes("ゴールデンウィーク") || f.includes("春休み"))) {
    tips.push("長期休暇シーズンはイベント目的の来園者も多いため、公式アプリでショー時間を確認しておきましょう。");
  }
  if (factors.some((f) => f.includes("地域限定パス") || f.includes("パスポート"))) {
    tips.push("地域限定パスポート利用期は地元来園者が増えやすいです。人気アトラクションは午前中の優先がおすすめです。");
  }
  if (factors.some((f) => f.includes("株主") || f.includes("優待"))) {
    tips.push("株主優待パスの配布直後・期限前は平日でも来園が増えやすいです。日付指定枠が埋まりやすい点に注意してください。");
  }
  if (factors.some((f) => f.includes("台風") || f.includes("豪雨") || f.includes("災害"))) {
    tips.push("荒天時は運休・短縮営業の可能性があります。公式情報と天気予報を前日までに確認してください。");
  }
  if (factors.some((f) => f.includes("USJ") || f.includes("他園"))) {
    tips.push("他テーマパークの混雑期はレジャー需要全体が高まりやすく、TDR も混み合う傾向があります。");
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
  const breakdown = buildCrowdBreakdown(dateStr, park);
  const factors = collectDayFactors(dateStr);
  const recent = getRecentFlowModifier(dateStr, today, liveBias);
  if (recent.label) factors.push(recent.label);

  if (breakdown.labels.schoolK12 !== "小中高・通常期") factors.push(breakdown.labels.schoolK12);
  if (breakdown.labels.universityBreak !== "大学・通常期") factors.push(breakdown.labels.universityBreak);
  if (breakdown.labels.regionalPassport !== "通常チケット期") factors.push(breakdown.labels.regionalPassport);
  if (breakdown.labels.shareholderPassport !== "株主優待・平常") {
    factors.push(breakdown.labels.shareholderPassport);
  }
  if (breakdown.labels.otherThemeParks !== "他園・通常") factors.push(breakdown.labels.otherThemeParks);
  if (breakdown.labels.metroEvents !== "都内イベント平常") factors.push(breakdown.labels.metroEvents);
  if (breakdown.labels.disasterImpact !== "災害影響小") factors.push(breakdown.labels.disasterImpact);

  const uniqueFactors = [...new Set(factors)];
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
    factors: uniqueFactors,
    description: buildDescription(park, dateStr, crowdLevel, uniqueFactors),
    visitTips: buildVisitTips(crowdLevel, uniqueFactors),
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
  options?: { skipLiveFetch?: boolean },
): Promise<DisneyCalendarMonth> {
  const cacheKey = `${park}:${year}-${String(month).padStart(2, "0")}`;
  const cached = monthCache.get(cacheKey);
  if (cached) return cached;

  await loadCrowdAdjustments();

  const today = getJstToday();
  let liveBias = 0;

  if (!options?.skipLiveFetch) {
    try {
      const { buildParkCrowdStatus } = await import("@/lib/server/disney-analysis");
      const status = await buildParkCrowdStatus(park);
      liveBias = crowdLevelToScoreDelta(status.crowdLevel);
    } catch {
      liveBias = 0;
    }
  }

  const accuracyMap = await getAccuracyMapForMonth(park, year, month);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // 過去日で未記録なら当月すべてバックフィル
  const pastWithoutRecord = getMonthDays(year, month).filter(
    (dateStr) => compareDateStr(dateStr, today) < 0 && !accuracyMap.has(dateStr),
  );
  if (pastWithoutRecord.length > 0) {
    const { upsertDayAccuracy } = await import("@/lib/server/disney-accuracy");
    const { seedEmpiricalSnapshotsForDate } = await import(
      "@/lib/server/disney-historical-store"
    );
    await Promise.all(
      pastWithoutRecord.map(async (dateStr) => {
        await seedEmpiricalSnapshotsForDate(park, dateStr);
        const record = await upsertDayAccuracy(park, dateStr);
        if (record) accuracyMap.set(dateStr, record);
      }),
    );
  }

  const days = getMonthDays(year, month).map((dateStr): DisneyCalendarDay => {
    const prediction = predictCrowdForDate(park, dateStr, liveBias);
    const breakdown = buildCrowdBreakdown(dateStr, park);
    const acc = accuracyMap.get(dateStr);
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
      accuracy: acc
        ? {
            predictedLevel: acc.predictedLevel,
            predictedScore: acc.predictedScore,
            actualLevel: acc.actualLevel,
            actualScore: acc.actualScore,
            actualAverageWait: acc.actualAverageWait,
            scoreDelta: acc.scoreDelta,
            levelHit: acc.levelHit,
          }
        : null,
    };
  });

  const monthRecords = [...accuracyMap.values()];
  const stats = summarizeAccuracy(monthRecords);
  const latestReview = await getLatestMonthlyReview();
  const monthReview =
    latestReview?.month === monthKey
      ? latestReview
      : latestReview;

  const payload: DisneyCalendarMonth = {
    park,
    year,
    month,
    monthLabel: `${year}年${month}月`,
    startWeekday: getMonthStartWeekday(year, month),
    days,
    today,
    accuracySummary: {
      evaluatedDays: stats.evaluatedDays,
      hits: stats.hits,
      hitRate: stats.hitRate,
      meanAbsScoreError: stats.meanAbsScoreError,
      latestReviewSummary: monthReview?.summary ?? null,
      reviewNewsFindings: monthReview?.newsFindings?.slice(0, 4),
      rulesChanged: [
        ...(monthReview?.rulesAdded ?? []).map(
          (r) => `追加 ${r.label}（Δ${r.scoreDelta > 0 ? "+" : ""}${r.scoreDelta}）`,
        ),
        ...(monthReview?.rulesUpdated ?? []).map(
          (r) => `見直 ${r.label}（Δ${r.scoreDelta > 0 ? "+" : ""}${r.scoreDelta}）`,
        ),
      ].slice(0, 6),
    },
  };

  monthCache.set(cacheKey, payload);
  return payload;
}

export const CALENDAR_MAX_MONTHS_AHEAD = 6;
export const CALENDAR_MAX_MONTHS_BACK = 2;

export function isMonthNavigable(year: number, month: number): boolean {
  const today = parseJstDate(getJstToday());
  const currentIndex = today.year * 12 + today.month;
  const targetIndex = year * 12 + month;
  return (
    targetIndex >= currentIndex - CALENDAR_MAX_MONTHS_BACK &&
    targetIndex <= currentIndex + CALENDAR_MAX_MONTHS_AHEAD
  );
}

export function isDateNavigable(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return isMonthNavigable(year, month);
}

export function clearCalendarMonthCache(): void {
  monthCache.clear();
}
