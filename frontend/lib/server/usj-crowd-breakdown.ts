/**
 * USJ 混雑スコア。
 * Disney の反省点を踏まえる:
 * - 祝日・週末・長期休みは過大評価しやすい → 係数をやや抑える
 * - ディズニー固有（株主パス・関東地域パス）をUSJに転用しない
 * - 関西イベント / エクスプレス需要 / HHN・任天堂エリア季節を明示
 * - 他園（TDR）ピーク日は USJ へ分散しやすい → otherThemeParks を逆転寄与
 */
import { parseJstDate, isJapanHoliday, isHolidayEve } from "@/lib/disney-holidays";
import {
  inMonthDayRange,
  scoreDisasterImpact,
  scoreSchoolK12,
  scoreUniversityBreak,
} from "@/lib/disney-crowd-extra-factors";
import type { DisneyCrowdBreakdown } from "@/lib/types/disney";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreCalendar(dateStr: string): { score: number; label: string } {
  const { dayOfWeek } = parseJstDate(dateStr);
  // Disney反省: 日曜+祝日の二重加点が過大になりやすい → ベースを抑える
  let score = 18;
  if (dayOfWeek === 6) score += 24;
  else if (dayOfWeek === 0) score += 26;
  else if (dayOfWeek === 5) score += 12;
  else score += 3;

  if (isJapanHoliday(dateStr)) score += 24;
  if (isHolidayEve(dateStr)) score += 12;

  const labels = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];
  const parts = [labels[dayOfWeek]!];
  if (isJapanHoliday(dateStr)) parts.push("祝日");
  if (isHolidayEve(dateStr)) parts.push("祝前日");
  return { score: clamp(score), label: parts.join("・") };
}

function scoreSeasonal(dateStr: string): { score: number; label: string } {
  const { month, day } = parseJstDate(dateStr);
  let score = 20;
  const tags: string[] = [];
  if (inMonthDayRange(month, day, [4, 29], [5, 6])) {
    score += 22;
    tags.push("GW");
  }
  if (inMonthDayRange(month, day, [8, 13], [8, 16])) {
    score += 20;
    tags.push("お盆");
  }
  if (inMonthDayRange(month, day, [12, 29], [1, 3])) {
    score += 24;
    tags.push("年末年始");
  }
  if (inMonthDayRange(month, day, [9, 1], [11, 15])) {
    score += 16;
    tags.push("HHNシーズン");
  }
  if (inMonthDayRange(month, day, [3, 1], [4, 10]) || inMonthDayRange(month, day, [11, 1], [12, 25])) {
    score += 10;
    tags.push("任天堂エリア需要期");
  }
  return { score: clamp(score), label: tags.length ? tags.join("・") : "季節・通常" };
}

/** ディズニー地域パスの代わり: エクスプレス／スタジオ・パス需要 */
function scoreExpressDemand(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 14;
  const tags: string[] = [];
  if (dayOfWeek === 0 || dayOfWeek === 6 || isJapanHoliday(dateStr)) {
    score += 18;
    tags.push("週末・祝日のエクスプレス需要");
  }
  if (inMonthDayRange(month, day, [7, 20], [8, 31]) || inMonthDayRange(month, day, [4, 29], [5, 6])) {
    score += 14;
    tags.push("長期休みの時間優先チケット");
  }
  return { score: clamp(score), label: tags.length ? tags.join("・") : "通常入場" };
}

/** ディズニー株主優待の代わり: 年間パスポート利用者の来園影響 */
function scoreAnnualPassport(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 16;
  const tags: string[] = [];
  // 平日・閑散寄りは年パス常連が増えやすい
  if (dayOfWeek >= 1 && dayOfWeek <= 4 && !isJapanHoliday(dateStr)) {
    score += 14;
    tags.push("平日の年パス来園");
  }
  if (dayOfWeek === 5 && !isJapanHoliday(dateStr)) {
    score += 10;
    tags.push("金曜の年パス・時間帯分散");
  }
  if (inMonthDayRange(month, day, [1, 15], [2, 28]) || inMonthDayRange(month, day, [6, 1], [6, 20])) {
    score += 12;
    tags.push("比較的空く時期の年パス利用");
  }
  if (dayOfWeek === 0 || dayOfWeek === 6 || isJapanHoliday(dateStr)) {
    score += 6;
    tags.push("週末も年パス層が下支え");
  }
  return {
    score: clamp(score),
    label: tags.length ? tags.join("・") : "年パス影響・標準",
  };
}

/** TDR が極端に混む日は関西へ分散しやすい（Disney反省の otherThemeParks 逆転） */
function scoreCompetitorPull(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 20;
  const tags: string[] = [];
  if (inMonthDayRange(month, day, [4, 29], [5, 6]) || inMonthDayRange(month, day, [12, 29], [1, 3])) {
    score += 12;
    tags.push("全国テーマパーク需要");
  }
  // 平日の修学旅行・団体は関西にも来る
  if ((month === 5 || month === 6 || month === 10) && dayOfWeek >= 1 && dayOfWeek <= 5) {
    score += 10;
    tags.push("関西団体シーズン");
  }
  return { score: clamp(score), label: tags.length ? tags.join("・") : "他園影響・通常" };
}

function scoreKansaiMetro(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 16;
  const tags: string[] = [];
  if (month === 3 && dayOfWeek >= 5) {
    score += 12;
    tags.push("卒業旅行需要");
  }
  if (inMonthDayRange(month, day, [11, 20], [11, 25])) {
    score += 10;
    tags.push("勤労感謝前後の関西観光");
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    score += 8;
    tags.push("関西近郊レジャー");
  }
  return { score: clamp(score), label: tags.length ? tags.join("・") : "関西イベント・通常" };
}

function scoreWeatherProxy(dateStr: string): { score: number; label: string } {
  const { month } = parseJstDate(dateStr);
  let score = 30;
  if (month === 6 || month === 9) {
    score += 8;
    return { score: clamp(score), label: "梅雨・台風シーズン留意" };
  }
  if (month === 7 || month === 8) {
    score += 12;
    return { score: clamp(score), label: "盛夏・屋外待ち負荷" };
  }
  return { score: clamp(score), label: "天候・標準" };
}

function scoreUsjEvents(dateStr: string): { score: number; label: string } {
  const { month, day } = parseJstDate(dateStr);
  let score = 18;
  const tags: string[] = [];
  if (inMonthDayRange(month, day, [9, 5], [11, 10])) {
    score += 22;
    tags.push("ハロウィーン・ホラーナイト");
  }
  if (inMonthDayRange(month, day, [12, 1], [12, 25])) {
    score += 14;
    tags.push("クリスマス装飾期");
  }
  if (inMonthDayRange(month, day, [1, 10], [2, 28])) {
    score -= 6;
    tags.push("比較的落ち着きやすい冬中盤");
  }
  return { score: clamp(score), label: tags.length ? tags.join("・") : "園内イベント・通常" };
}

/**
 * Disney反省: historical 単独の重い加点を避け、季節平均を控えめに。
 * ライブ実績が溜まるまでの暫定。
 */
function scoreHistoricalProxy(dateStr: string): { score: number; label: string } {
  const { dayOfWeek } = parseJstDate(dateStr);
  let score = 28;
  if (dayOfWeek === 0 || dayOfWeek === 6) score += 8;
  if (isJapanHoliday(dateStr)) score += 6;
  return {
    score: clamp(score),
    label: "暫定過去傾向（ライブ実績蓄積中・過大評価抑制）",
  };
}

export function buildUsjCrowdBreakdown(dateStr: string): DisneyCrowdBreakdown {
  const calendar = scoreCalendar(dateStr);
  const seasonal = scoreSeasonal(dateStr);
  const schoolK12 = scoreSchoolK12(dateStr);
  const universityBreak = scoreUniversityBreak(dateStr);
  const weather = scoreWeatherProxy(dateStr);
  const event = scoreUsjEvents(dateStr);
  const express = scoreExpressDemand(dateStr);
  const annualPassport = scoreAnnualPassport(dateStr);
  const competitor = scoreCompetitorPull(dateStr);
  const metro = scoreKansaiMetro(dateStr);
  const disaster = scoreDisasterImpact(dateStr);
  const historical = scoreHistoricalProxy(dateStr);

  // Disney反省: 単一要因の暴走を防ぐため重みを分散。
  // 株主パス枠 → 年パス影響、地域パス枠 → エクスプレス需要、都内枠 → 関西近郊。
  const total = clamp(
    calendar.score * 0.1 +
      seasonal.score * 0.09 +
      schoolK12.score * 0.11 +
      universityBreak.score * 0.07 +
      weather.score * 0.06 +
      event.score * 0.11 +
      express.score * 0.09 +
      annualPassport.score * 0.08 +
      competitor.score * 0.07 +
      metro.score * 0.08 +
      disaster.score * 0.05 +
      historical.score * 0.05 +
      4, // ニュース・物販の粗いベース（過大にしない）
  );

  return {
    calendar: calendar.score,
    seasonal: seasonal.score,
    schoolK12: schoolK12.score,
    universityBreak: universityBreak.score,
    weather: weather.score,
    event: event.score,
    regionalPassport: express.score,
    shareholderPassport: annualPassport.score,
    otherThemeParks: competitor.score,
    metroEvents: metro.score,
    newsBuzz: 20,
    merchandise: 18,
    historical: historical.score,
    disasterImpact: disaster.score,
    total,
    labels: {
      calendar: calendar.label,
      seasonal: seasonal.label,
      schoolK12: schoolK12.label,
      universityBreak: universityBreak.label,
      weather: weather.label,
      event: event.label,
      regionalPassport: express.label,
      shareholderPassport: annualPassport.label,
      otherThemeParks: competitor.label,
      metroEvents: metro.label,
      newsBuzz: "話題性・標準",
      merchandise: "物販・標準",
      historical: historical.label,
      disasterImpact: disaster.label,
    },
  };
}
