/**
 * Soluna 朝パイプラインのスキップ判定（GHA status と一致させる）。
 *
 * 再発クラス: battle だけ complete だと Note/jobs 失敗後に永久スキップする。
 * 不変条件: 当日の討伐＋Note 原稿（jobs）が揃うまで、jobs だけでも再実行する。
 */

export type SolunaPipelineSkipInput = {
  /** briefing + battle が当日分そろっている */
  battleComplete: boolean;
  /** 当日 briefingId の Note 原稿がまだ無い */
  jobsNeedsRun: boolean;
  force?: boolean;
};

export type SolunaPipelineSkipPlan = {
  /** news → chat → verify → jobs */
  runFullPipeline: boolean;
  /** battle 済み・Note 未作成だけ再実行 */
  runJobsOnly: boolean;
};

export function planSolunaDailyPipeline(
  input: SolunaPipelineSkipInput,
): SolunaPipelineSkipPlan {
  if (input.force) {
    return { runFullPipeline: true, runJobsOnly: false };
  }
  if (!input.battleComplete) {
    return { runFullPipeline: true, runJobsOnly: false };
  }
  if (input.jobsNeedsRun) {
    return { runFullPipeline: false, runJobsOnly: true };
  }
  return { runFullPipeline: false, runJobsOnly: false };
}

export function solunaNoteCoversBriefing(
  note: { briefingId?: string | null } | null | undefined,
  todayBriefingId: string,
): boolean {
  return Boolean(note?.briefingId && note.briefingId === todayBriefingId);
}
