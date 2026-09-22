/**
 * News Search 定時スキップ判定オラクル
 * Run: npx --yes tsx lib/works-news-search-schedule.test.ts
 */
import assert from "node:assert/strict";
import {
  hasWorksNewsScheduleStatusSchema,
  isWorksNewsTodayCompleteForSchedule,
} from "./works-news-search-schedule";

const todayId = "works-news-search-2026-09-22";
const yesterdayId = "works-news-search-2026-09-21";

{
  // 当日 complete → 次の定時はスキップしてよい
  assert.equal(
    isWorksNewsTodayCompleteForSchedule({
      enrichmentOk: true,
      enrichmentStatus: "complete",
      isToday: true,
      digestId: todayId,
      expectedDigestId: todayId,
    }),
    true,
  );
}

{
  // 昨日 complete を enrichmentOk だけで見るとスキップしてしまうのが障害クラス
  assert.equal(
    isWorksNewsTodayCompleteForSchedule({
      enrichmentOk: true,
      enrichmentStatus: "complete",
      isToday: false,
      digestId: yesterdayId,
      expectedDigestId: todayId,
    }),
    false,
  );
}

{
  // 当日ドキュメント無し
  assert.equal(
    isWorksNewsTodayCompleteForSchedule({
      enrichmentOk: false,
      enrichmentStatus: "missing",
      isToday: false,
      digestId: null,
      expectedDigestId: todayId,
      reason: "today-missing",
    }),
    false,
  );
}

{
  // 旧 API（isToday 無し）→ fail-closed（スキップ禁止）
  assert.equal(
    isWorksNewsTodayCompleteForSchedule({
      enrichmentOk: true,
      enrichmentStatus: "complete",
      digestId: yesterdayId,
    }),
    false,
  );
  assert.equal(
    hasWorksNewsScheduleStatusSchema({
      enrichmentOk: true,
      enrichmentStatus: "complete",
      digestId: yesterdayId,
    }),
    false,
  );
  assert.equal(
    hasWorksNewsScheduleStatusSchema({
      enrichmentOk: true,
      enrichmentStatus: "complete",
      isToday: true,
      digestId: todayId,
      expectedDigestId: todayId,
    }),
    true,
  );
}

{
  // digestId と expected 不一致
  assert.equal(
    isWorksNewsTodayCompleteForSchedule({
      enrichmentOk: true,
      enrichmentStatus: "complete",
      isToday: true,
      digestId: yesterdayId,
      expectedDigestId: todayId,
    }),
    false,
  );
}

console.log("works-news-search-schedule.test.ts: ok");
