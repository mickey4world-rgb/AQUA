import { parseJstDate, isJapanHoliday, isHolidayEve } from "@/lib/disney-holidays";
import {
  inMonthDayRange,
  scoreDisasterImpact,
  scoreMetroEvents,
  scoreOtherThemeParks,
  scoreRegionalPassport,
  scoreSchoolK12,
  scoreUniversityBreak,
} from "@/lib/disney-crowd-extra-factors";
import { blendCrowdFactorScores, clampCrowdScore } from "@/lib/disney-crowd-score";
import { scoreShareholderPassport } from "@/lib/disney-shareholder-passport";
import { getCachedAdjustmentForDate } from "@/lib/server/disney-crowd-adjustments";
import type { DisneyCrowdBreakdown, DisneyParkKey } from "@/lib/types/disney";

function inRange(month: number, day: number, from: [number, number], to: [number, number]): boolean {
  return inMonthDayRange(month, day, from, to);
}

function clamp(n: number): number {
  return clampCrowdScore(n);
}

function scoreCalendar(dateStr: string): { score: number; label: string } {
  const { dayOfWeek } = parseJstDate(dateStr);
  // TDR は平日でも来園が残るため、基準を低くしすぎない
  let score = 40;
  if (dayOfWeek === 6) score += 26;
  else if (dayOfWeek === 0) score += 30;
  else if (dayOfWeek === 5) score += 16;
  else score += 8;

  if (isJapanHoliday(dateStr)) score += 28;
  if (isHolidayEve(dateStr)) score += 14;

  const labels = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];
  const parts = [labels[dayOfWeek]];
  if (isJapanHoliday(dateStr)) parts.push("祝日");
  if (isHolidayEve(dateStr)) parts.push("祝前日");
  return { score: clamp(score), label: parts.join("・") };
}

function scoreSeasonal(dateStr: string): { score: number; label: string } {
  const { month, day } = parseJstDate(dateStr);
  let score = 42;
  const tags: string[] = [];

  if (inRange(month, day, [3, 20], [4, 7])) {
    score += 24;
    tags.push("春休み");
  }
  if (inRange(month, day, [4, 29], [5, 6])) {
    score += 32;
    tags.push("GW");
  }
  if (inRange(month, day, [7, 20], [8, 31])) {
    score += 28;
    tags.push("夏休み");
  }
  if (inRange(month, day, [8, 13], [8, 16])) {
    score += 16;
    tags.push("お盆");
  }
  if (inRange(month, day, [12, 23], [12, 31])) {
    score += 28;
    tags.push("年末");
  }
  if (inRange(month, day, [1, 1], [1, 3])) {
    score += 30;
    tags.push("正月");
  }
  // 秋の3連休・スポーツの日前後
  if (inRange(month, day, [10, 10], [10, 14])) {
    score += 12;
    tags.push("秋連休前後");
  }
  if (month === 2 && day <= 14) {
    score -= 10;
    tags.push("閑散期");
  }
  // 11月平日は少し落ち着くが、過大に下げない（実績との系統的下振れの主因だった）
  if (month === 11 && dayOfWeekBetween(dateStr, 1, 4)) {
    score -= 4;
    tags.push("11月平日");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "通常シーズン" };
}

function dayOfWeekBetween(dateStr: string, from: number, to: number): boolean {
  const { dayOfWeek } = parseJstDate(dateStr);
  return dayOfWeek >= from && dayOfWeek <= to;
}

function scoreWeather(dateStr: string): { score: number; label: string } {
  const { month } = parseJstDate(dateStr);
  // 雨・暑さで屋内集中 → 待ち時間上振れしやすい月
  const table: Record<number, { score: number; label: string }> = {
    1: { score: 48, label: "寒さ・新年イベント" },
    2: { score: 40, label: "冬・比較的落ち着き" },
    3: { score: 50, label: "春の気温・花粉" },
    4: { score: 52, label: "春晴れ・屋外増" },
    5: { score: 50, label: "初夏・雨天時屋内集中" },
    6: { score: 58, label: "梅雨・屋内優先" },
    7: { score: 62, label: "猛暑・屋内シフト" },
    8: { score: 66, label: "真夏・熱中症注意" },
    9: { score: 52, label: "残暑・台風シーズン" },
    10: { score: 48, label: "秋晴れ" },
    11: { score: 46, label: "秋・乾燥" },
    12: { score: 56, label: "冬・イルミネーション" },
  };
  const row = table[month] ?? { score: 48, label: "通常天候" };
  return { score: clamp(row.score), label: row.label };
}

function scoreEvent(dateStr: string, park: DisneyParkKey): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 42;
  const tags: string[] = [];

  if (month === 10 && day >= 10) {
    score += 22;
    tags.push("ハロウィーン");
  }
  if (month === 11 && day >= 8) {
    score += 16;
    tags.push("クリスマス準備");
  }
  if (month === 12) {
    score += 24;
    tags.push("クリスマス");
  }
  if (month === 1 && day <= 12) {
    score += 18;
    tags.push("ニューイヤー");
  }
  if (month === 4 && day >= 15) {
    score += 12;
    tags.push("春イベント");
  }
  // 週末は公演・グリーティング需要が乗やすい
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    score += 8;
    tags.push("週末公演需要");
  }
  if (park === "tds" && month >= 6 && month <= 8) {
    score += 8;
    tags.push("シー夏イベント");
  }
  if (park === "tdl" && month === 3) {
    score += 10;
    tags.push("ランド春イベント");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "通常イベント" };
}

function scoreNewsBuzz(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 44;
  const tags: string[] = [];

  // 世間の注目が高まりやすい時期（SNS・メディア露出の経験則）
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    score += 12;
    tags.push("週末SNS投稿増");
  }
  if (month === 12 && day >= 20) {
    score += 16;
    tags.push("年末メディア注目");
  }
  if (inRange(month, day, [3, 25], [4, 5])) {
    score += 14;
    tags.push("春休みニュース");
  }
  if (month === 8 && day <= 20) {
    score += 12;
    tags.push("夏休み話題");
  }
  if (month === 11 && day >= 8) {
    score += 8;
    tags.push("ホリデー発表・話題");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "通常注目度" };
}

function scoreMerchandise(dateStr: string): { score: number; label: string } {
  const { month, day } = parseJstDate(dateStr);
  let score = 40;
  const tags: string[] = [];

  if (month === 1 && day <= 31) {
    score += 20;
    tags.push("福袋・新作グッズ");
  }
  if (month === 7 || month === 8) {
    score += 14;
    tags.push("夏限定グッズ");
  }
  if (month === 10) {
    score += 16;
    tags.push("ハロウィーングッズ");
  }
  if (month === 11 || month === 12) {
    score += 18;
    tags.push("クリスマスグッズ");
  }
  if (month === 4) {
    score += 10;
    tags.push("春限定グッズ");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "通常販売" };
}

function scoreHistorical(dateStr: string, park: DisneyParkKey): { score: number; label: string } {
  const { month, dayOfWeek } = parseJstDate(dateStr);
  // TDR は通年で待ちが残りやすい → 過去傾向の床を上げる
  let score = 48;
  const tags: string[] = ["TDR定番混雑"];

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    score += 12;
    tags.push("土日の過去混雑");
  }
  if (month === 3 && dayOfWeek >= 5) {
    score += 12;
    tags.push("昨年同月土日混雑");
  }
  if (month === 4 && dayOfWeek >= 5) {
    score += 14;
    tags.push("昨年GW前後混雑");
  }
  if (month === 8 && dayOfWeek === 0) {
    score += 10;
    tags.push("昨年夏休み日曜");
  }
  if (month === 11 && dayOfWeek >= 1 && dayOfWeek <= 4) {
    score -= 6;
    tags.push("昨年11月平日落ち着き");
  }
  if (park === "tdl") score += 3;

  return { score: clamp(score), label: tags.join("・") };
}

export function buildCrowdBreakdown(
  dateStr: string,
  park: DisneyParkKey,
): DisneyCrowdBreakdown {
  const calendar = scoreCalendar(dateStr);
  const seasonal = scoreSeasonal(dateStr);
  const schoolK12 = scoreSchoolK12(dateStr);
  const universityBreak = scoreUniversityBreak(dateStr);
  const weather = scoreWeather(dateStr);
  const event = scoreEvent(dateStr, park);
  const regionalPassport = scoreRegionalPassport(dateStr);
  const shareholderPassport = scoreShareholderPassport(dateStr);
  const otherThemeParks = scoreOtherThemeParks(dateStr);
  const metroEvents = scoreMetroEvents(dateStr);
  const newsBuzz = scoreNewsBuzz(dateStr);
  const merchandise = scoreMerchandise(dateStr);
  const historical = scoreHistorical(dateStr, park);
  const disasterImpact = scoreDisasterImpact(dateStr);
  const adjustment = getCachedAdjustmentForDate(dateStr, park);

  // 曜日・季節・学校・イベント・過去傾向を厚く。低基準の希釈要因は薄く。
  const total = blendCrowdFactorScores(
    [
      { score: calendar.score, weight: 0.16 },
      { score: seasonal.score, weight: 0.12 },
      { score: schoolK12.score, weight: 0.12 },
      { score: universityBreak.score, weight: 0.05 },
      { score: weather.score, weight: 0.07 },
      { score: event.score, weight: 0.1 },
      { score: regionalPassport.score, weight: 0.06 },
      { score: shareholderPassport.score, weight: 0.08 },
      { score: otherThemeParks.score, weight: 0.05 },
      { score: metroEvents.score, weight: 0.04 },
      { score: newsBuzz.score, weight: 0.03 },
      { score: merchandise.score, weight: 0.02 },
      { score: historical.score, weight: 0.08 },
      { score: disasterImpact.score, weight: 0.02 },
    ],
    adjustment.delta,
  );

  const historicalLabel =
    adjustment.labels.length > 0
      ? `${historical.label}・${adjustment.labels.slice(0, 2).join("・")}`
      : historical.label;

  return {
    calendar: calendar.score,
    seasonal: seasonal.score,
    schoolK12: schoolK12.score,
    universityBreak: universityBreak.score,
    weather: weather.score,
    event: event.score,
    regionalPassport: regionalPassport.score,
    shareholderPassport: shareholderPassport.score,
    otherThemeParks: otherThemeParks.score,
    metroEvents: metroEvents.score,
    newsBuzz: newsBuzz.score,
    merchandise: merchandise.score,
    historical: historical.score,
    disasterImpact: disasterImpact.score,
    total,
    labels: {
      calendar: calendar.label,
      seasonal: seasonal.label,
      schoolK12: schoolK12.label,
      universityBreak: universityBreak.label,
      weather: weather.label,
      event: event.label,
      regionalPassport: regionalPassport.label,
      shareholderPassport: shareholderPassport.label,
      otherThemeParks: otherThemeParks.label,
      metroEvents: metroEvents.label,
      newsBuzz: newsBuzz.label,
      merchandise: merchandise.label,
      historical: historicalLabel,
      disasterImpact: disasterImpact.label,
    },
  };
}
