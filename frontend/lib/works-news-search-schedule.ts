/**
 * News Search 定時スキップ判定（GHA / fetch script と同一条件）。
 *
 * 再発クラス: enrichmentOk だけ見ると「昨日 complete」で当日スキップが永久化する。
 * 不変条件: スキップしてよいのは 当日 JST digest が complete のときだけ。
 * 古い status（isToday / expectedDigestId 無し）はスキップ禁止（fail-closed）。
 */

export type WorksNewsCronStatusLike = {
  enrichmentOk?: boolean;
  enrichmentStatus?: string | null;
  isToday?: boolean;
  digestId?: string | null;
  expectedDigestId?: string | null;
  reason?: string | null;
};

/** 定時ジョブが ingest/enrich をスキップしてよいか */
export function isWorksNewsTodayCompleteForSchedule(
  status: WorksNewsCronStatusLike,
): boolean {
  if (status.isToday !== true) return false;
  if (status.enrichmentOk !== true) return false;
  if (status.enrichmentStatus !== "complete") return false;
  if (typeof status.digestId !== "string" || !status.digestId) return false;
  if (typeof status.expectedDigestId !== "string" || !status.expectedDigestId) {
    return false;
  }
  return status.digestId === status.expectedDigestId;
}

/** status JSON が新スキーマか（デプロイ遅れ検知） */
export function hasWorksNewsScheduleStatusSchema(
  status: WorksNewsCronStatusLike,
): boolean {
  return (
    typeof status.isToday === "boolean" &&
    typeof status.expectedDigestId === "string" &&
    status.expectedDigestId.length > 0
  );
}
