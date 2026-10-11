import assert from "node:assert/strict";
import {
  planSolunaDailyPipeline,
  solunaNoteCoversBriefing,
} from "./soluna-daily-pipeline";

assert.deepEqual(
  planSolunaDailyPipeline({ battleComplete: false, jobsNeedsRun: false }),
  { runFullPipeline: true, runJobsOnly: false },
);

assert.deepEqual(
  planSolunaDailyPipeline({ battleComplete: true, jobsNeedsRun: false }),
  { runFullPipeline: false, runJobsOnly: false },
);

// 討伐だけ完了・Note 未作成 → jobs のみ（永久スキップ禁止）
assert.deepEqual(
  planSolunaDailyPipeline({ battleComplete: true, jobsNeedsRun: true }),
  { runFullPipeline: false, runJobsOnly: true },
);

assert.deepEqual(
  planSolunaDailyPipeline({
    battleComplete: true,
    jobsNeedsRun: true,
    force: true,
  }),
  { runFullPipeline: true, runJobsOnly: false },
);

assert.equal(
  solunaNoteCoversBriefing({ briefingId: "briefing-2026-10-12" }, "briefing-2026-10-12"),
  true,
);
assert.equal(
  solunaNoteCoversBriefing({ briefingId: "briefing-2026-10-11" }, "briefing-2026-10-12"),
  false,
);
assert.equal(solunaNoteCoversBriefing(null, "briefing-2026-10-12"), false);

console.log("soluna-daily-pipeline.test.ts: ok");
