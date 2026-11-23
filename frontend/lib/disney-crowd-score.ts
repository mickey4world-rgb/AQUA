/**
 * 混雑スコアの合成と、待ち時間実績とのスケール合わせ。
 *
 * 過去の失敗:
 * - 各要因の基準点が 15〜25 と低く、加重平均すると土日でも合計 30 点台
 * - 実績は待ち時間帯の代表点（22/42/62/82）と比較 → 毎日 15〜30 点の系統的な下振れ
 */

export function clampCrowdScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 内訳バーの「ふつう」の目安（これより低いと合計を過度に押し下げる） */
export const CROWD_FACTOR_NEUTRAL = 48;

/**
 * 要因スコアを合計点にする。
 * 1) 重み付き平均
 * 2) 中立点未満の希釈を抑える補正
 * 3) 待ち時間実績スケールへ校正（典型的な土日〜繁忙が 55〜80 に乗る）
 */
export function blendCrowdFactorScores(
  factors: Array<{ score: number; weight: number }>,
  adjustmentDelta = 0,
): number {
  const weightSum = factors.reduce((sum, f) => sum + f.weight, 0);
  if (weightSum <= 0) return clampCrowdScore(CROWD_FACTOR_NEUTRAL + adjustmentDelta);

  const weighted =
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) / weightSum;

  // 中立未満の因子だけ平均を引きずっている分を緩和（強い要因の加点を残す）
  const below = factors.filter((f) => f.score < CROWD_FACTOR_NEUTRAL);
  const drag =
    below.length === 0
      ? 0
      : below.reduce(
          (sum, f) => sum + (CROWD_FACTOR_NEUTRAL - f.score) * f.weight,
          0,
        ) / weightSum;
  const deDiluted = weighted + drag * 0.55;

  // raw 35→約52 / 45→約64 / 55→約76 付近へ（実績 high=62・extreme=82 と同スケール）
  const calibrated = 8 + deDiluted * 1.22;
  return clampCrowdScore(calibrated + adjustmentDelta);
}

/**
 * 平均待ち（分）→ 0〜100 の実績スコア（連続）。
 * レベル境界と整合: 25分≈32点, 45分≈52点, 70分≈72点。
 */
export function waitAverageToCrowdScore(averageWait: number): number {
  const w = Math.max(0, averageWait);
  if (w < 25) return clampCrowdScore(14 + (w / 25) * 18);
  if (w < 45) return clampCrowdScore(32 + ((w - 25) / 20) * 20);
  if (w < 70) return clampCrowdScore(52 + ((w - 45) / 25) * 20);
  return clampCrowdScore(72 + Math.min(28, (w - 70) * 0.45));
}

export function crowdScoreToLevel(
  score: number,
): "low" | "moderate" | "high" | "extreme" {
  if (score < 32) return "low";
  if (score < 52) return "moderate";
  if (score < 72) return "high";
  return "extreme";
}
