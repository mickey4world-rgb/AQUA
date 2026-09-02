import { parseJstDate } from "@/lib/disney-holidays";

export function inMonthDayRange(
  month: number,
  day: number,
  from: [number, number],
  to: [number, number],
): boolean {
  const value = month * 100 + day;
  return value >= from[0] * 100 + from[1] && value <= to[0] * 100 + to[1];
}

/** 小中高の長期休暇・イベント時期 */
export function scoreSchoolK12(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 18;
  const tags: string[] = [];

  if (inMonthDayRange(month, day, [3, 20], [4, 7])) {
    score += 32;
    tags.push("小中高・春休み");
  }
  if (inMonthDayRange(month, day, [7, 20], [8, 31])) {
    score += 34;
    tags.push("小中高・夏休み");
  }
  if (inMonthDayRange(month, day, [12, 26], [1, 7])) {
    score += 28;
    tags.push("小中高・冬休み");
  }

  // 運動会・文化祭シーズン（週末の家族来園増）
  if ((month === 5 || (month === 9 && day >= 15) || month === 10) && dayOfWeek >= 5) {
    score += 10;
    tags.push("学校イベント時期");
  }

  // 修学旅行シーズン（平日の団体来園）
  if ((month === 5 || month === 6 || (month === 10 && day <= 20)) && dayOfWeek >= 1 && dayOfWeek <= 5) {
    score += 8;
    tags.push("修学旅行シーズン");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "小中高・通常期" };
}

/** 大学の長期休暇・イベント時期 */
export function scoreUniversityBreak(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 16;
  const tags: string[] = [];

  if (inMonthDayRange(month, day, [2, 1], [4, 10])) {
    score += 26;
    tags.push("大学・春休み");
  }
  if (inMonthDayRange(month, day, [7, 15], [9, 30])) {
    score += 28;
    tags.push("大学・夏休み");
  }
  if (inMonthDayRange(month, day, [12, 20], [1, 10])) {
    score += 22;
    tags.push("大学・冬休み");
  }

  // 試験期間は来園がやや減る（平日中心）
  if (
    (inMonthDayRange(month, day, [1, 20], [2, 5]) ||
      inMonthDayRange(month, day, [5, 25], [6, 10]) ||
      inMonthDayRange(month, day, [10, 25], [11, 10])) &&
    dayOfWeek >= 1 &&
    dayOfWeek <= 5
  ) {
    score -= 10;
    tags.push("大学・試験期間");
  }

  // 新歓・オリエンテーション（4月上旬）
  if (inMonthDayRange(month, day, [4, 1], [4, 20]) && dayOfWeek >= 5) {
    score += 12;
    tags.push("大学・新歓期");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "大学・通常期" };
}

/** 地域限定ディズニーパスポート発行・利用が集中しやすい時期 */
export function scoreRegionalPassport(dateStr: string): { score: number; label: string } {
  const { month, day } = parseJstDate(dateStr);
  let score = 12;
  const tags: string[] = [];

  // 春・秋に関東限定パスポートの発売・利用が集中しやすい
  if (inMonthDayRange(month, day, [3, 1], [5, 15])) {
    score += 22;
    tags.push("春の地域限定パス");
  }
  if (inMonthDayRange(month, day, [9, 1], [11, 30])) {
    score += 24;
    tags.push("秋の地域限定パス");
  }

  // 発売直後（3月中旬・9月中旬）は特に来園が増えやすい
  if (inMonthDayRange(month, day, [3, 10], [3, 31]) || inMonthDayRange(month, day, [9, 10], [9, 30])) {
    score += 10;
    tags.push("パスポート発売直後");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "通常チケット期" };
}

/** 他テーマパーク（USJ・富士急など）の混雑・イベントが TDR 需要に与える影響 */
export function scoreOtherThemeParks(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 22;
  const tags: string[] = [];

  // テーマパーク全体の需要が高い時期（他園も混雑 → TDR も高止まり）
  if (inMonthDayRange(month, day, [4, 29], [5, 6])) {
    score += 28;
    tags.push("USJ・他園GW混雑");
  }
  if (inMonthDayRange(month, day, [7, 20], [8, 25])) {
    score += 22;
    tags.push("USJ・夏休み混雑");
  }
  if (month === 10 && day >= 10) {
    score += 18;
    tags.push("USJ・ハロウィーン");
  }
  if (month === 8 && dayOfWeek >= 5) {
    score += 14;
    tags.push("富士急・夏週末");
  }

  // USJ 新エリア・大型イベント期（経験則: 春〜初夏）
  if (inMonthDayRange(month, day, [3, 15], [6, 30])) {
    score += 6;
    tags.push("他園イベント期");
  }

  // 他園が休園・荒天で TDR に流れる可能性（真夏の台風シーズン）
  if (inMonthDayRange(month, day, [8, 25], [10, 10]) && dayOfWeek >= 5) {
    score += 8;
    tags.push("他園休園時の代替需要");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "他園・通常" };
}

/** 都内・湾岸の大型イベント・コンサート・スポーツによる人流 */
export function scoreMetroEvents(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 14;
  const tags: string[] = [];

  // 東京マラソン（3月第1日曜前後）
  if (month === 3 && day >= 1 && day <= 7 && dayOfWeek === 0) {
    score += 16;
    tags.push("東京マラソン");
  }

  // 大相撲（1・5・9月）
  if ((month === 1 || month === 5 || month === 9) && dayOfWeek >= 5) {
    score += 12;
    tags.push("大相撲・都内イベント");
  }

  // コミケ（8月中旬・12月末）
  if (inMonthDayRange(month, day, [8, 10], [8, 17]) || inMonthDayRange(month, day, [12, 28], [12, 31])) {
    score += 18;
    tags.push("コミケ・Big Sight");
  }

  // 東京ゲームショウ（9月）
  if (month === 9 && day >= 20 && day <= 28) {
    score += 14;
    tags.push("TGS・幕張");
  }

  // ドーム・スタジアムの週末イベント（通年）
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    score += 8;
    tags.push("週末スポーツ・ライブ");
  }

  // 花火大会シーズン（7〜8月の週末）
  if ((month === 7 || month === 8) && dayOfWeek >= 5) {
    score += 10;
    tags.push("花火大会シーズン");
  }

  // 年末カウントダウン・ライブ
  if (inMonthDayRange(month, day, [12, 29], [12, 31])) {
    score += 16;
    tags.push("年末イベント");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "都内イベント平常" };
}

/** 台風・大雨・震災などで来園者の流れが変わりやすい時期 */
export function scoreDisasterImpact(dateStr: string): { score: number; label: string } {
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let score = 20;
  const tags: string[] = [];

  // 台風シーズン（来園キャンセルと室内代替需要が混在 → 週末は高止まり）
  if (inMonthDayRange(month, day, [8, 20], [10, 15])) {
    score += dayOfWeek >= 5 ? 18 : 10;
    tags.push("台風シーズン");
  }

  // 9月は台風ピーク
  if (month === 9) {
    score += 8;
    tags.push("台風ピーク");
  }

  // 梅雨・集中豪雨（6〜7月）
  if (month === 6 || (month === 7 && day <= 20)) {
    score += 12;
    tags.push("梅雨・豪雨");
  }

  // 東日本大震災以降、防災意識が高い時期は計画来園が変動（3月11日前後）
  if (month === 3 && day >= 9 && day <= 13) {
    score -= 6;
    tags.push("震災関連・来園控え");
  }

  // 積雪・寒波（1〜2月の平日は来園減）
  if ((month === 1 || month === 2) && dayOfWeek >= 1 && dayOfWeek <= 4) {
    score -= 4;
    tags.push("寒波・交通乱れ");
  }

  return { score: clamp(score), label: tags.length ? tags.join("・") : "災害影響小" };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
