/**
 * 当日 BOINC を GHA で再実行すべきか。
 * 接続失敗を status=error で報告済みのあと毎時リトライすると
 * workflow 失敗メールが連打される（2026-11 障害クラス）。
 * 失敗報告（result.finishedAt あり）は当日クローズ扱い。手動 force のみ再実行。
 */
export type BoincRunForNeeds = {
  status?: string | null;
  result?: { finishedAt?: string | null } | null;
} | null;

export function computeBoincNeedsRun(boincForToday: BoincRunForNeeds): boolean {
  if (!boincForToday) return false;
  const status = boincForToday.status ?? "";
  if (status === "waiting-spec" || status === "queued") return true;
  // 未着手（結果なし）のみ再実行。error でも報告済みなら止める。
  if (status === "done") return false;
  if (status === "error" && boincForToday.result?.finishedAt) return false;
  if (status === "error") return true;
  return !boincForToday.result;
}
