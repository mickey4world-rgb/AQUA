import assert from "node:assert/strict";
import { computeBoincNeedsRun } from "./soluna-boinc-needs-run";

assert.equal(computeBoincNeedsRun(null), false);
assert.equal(computeBoincNeedsRun({ status: "waiting-spec" }), true);
assert.equal(computeBoincNeedsRun({ status: "queued" }), true);
assert.equal(computeBoincNeedsRun({ status: "done", result: { finishedAt: "x" } }), false);

// 接続失敗を報告済み → 毎時リトライしない（メール連打防止）
assert.equal(
  computeBoincNeedsRun({
    status: "error",
    result: { finishedAt: "2026-11-07T09:46:08.000Z" },
  }),
  false,
);

// error だが未報告 → まだ走らせる
assert.equal(computeBoincNeedsRun({ status: "error" }), true);
assert.equal(computeBoincNeedsRun({ status: "error", result: {} }), true);

console.log("soluna-boinc-needs-run.test.ts: ok");
