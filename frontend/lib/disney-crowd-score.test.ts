/**
 * Run: npx --yes tsx lib/disney-crowd-score.test.ts
 */
import assert from "node:assert/strict";
import {
  blendCrowdFactorScores,
  crowdScoreToLevel,
  waitAverageToCrowdScore,
} from "./disney-crowd-score";
import { buildCrowdBreakdown } from "./server/disney-crowd-breakdown";

{
  // 待ち時間 → スコアがレベル境界と整合
  assert.equal(crowdScoreToLevel(waitAverageToCrowdScore(24)), "low");
  assert.equal(crowdScoreToLevel(waitAverageToCrowdScore(25)), "moderate");
  assert.equal(crowdScoreToLevel(waitAverageToCrowdScore(44)), "moderate");
  assert.equal(crowdScoreToLevel(waitAverageToCrowdScore(45)), "high");
  assert.equal(crowdScoreToLevel(waitAverageToCrowdScore(69)), "high");
  assert.equal(crowdScoreToLevel(waitAverageToCrowdScore(70)), "extreme");
  assert.ok(waitAverageToCrowdScore(50) >= 52 && waitAverageToCrowdScore(50) < 72);
  assert.ok(waitAverageToCrowdScore(80) >= 72);
}

{
  // 低基準点だらけの加重平均を、希釈補正で押し上げる
  const diluted = blendCrowdFactorScores([
    { score: 70, weight: 0.2 },
    { score: 20, weight: 0.2 },
    { score: 18, weight: 0.2 },
    { score: 16, weight: 0.2 },
    { score: 14, weight: 0.2 },
  ]);
  assert.ok(diluted >= 45, `希釈補正後は45以上であるべき: ${diluted}`);
}

{
  // オラクル: 土日・GW・夏休みの合計が実績 high 帯（52+）に乗る
  const weekend = buildCrowdBreakdown("2026-11-22", "tdl"); // 日曜
  const weekday = buildCrowdBreakdown("2026-11-18", "tdl"); // 水曜
  const gw = buildCrowdBreakdown("2026-05-03", "tdl");
  const summer = buildCrowdBreakdown("2026-08-15", "tdl");

  assert.ok(
    weekend.total >= 55,
    `日曜合計が低すぎる: ${weekend.total}（旧ロジックは34前後で実績62と15〜30点乖離）`,
  );
  assert.ok(
    weekday.total >= 42,
    `平日合計が低すぎる: ${weekday.total}`,
  );
  assert.ok(gw.total >= 65, `GW合計が低すぎる: ${gw.total}`);
  assert.ok(summer.total >= 65, `夏休み合計が低すぎる: ${summer.total}`);
  assert.ok(
    weekend.total > weekday.total,
    "日曜は平日より高いこと",
  );
  assert.ok(
    Math.abs(weekend.total - 62) <= 18,
    `日曜合計と実績 high 代表(62)の差が大きすぎる: ${weekend.total}`,
  );
}

{
  // 小中高 GW 条件が付く
  const gw = buildCrowdBreakdown("2026-05-04", "tdl");
  assert.ok(
    gw.labels.schoolK12.includes("GW"),
    `GW の学校要因が無い: ${gw.labels.schoolK12}`,
  );
}

console.log("disney-crowd-score.test.ts: ok");
