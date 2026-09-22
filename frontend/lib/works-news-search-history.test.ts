/**
 * Run: npx --yes tsx lib/works-news-search-history.test.ts
 */
import assert from "node:assert/strict";
import {
  isAllowedWorksNewsHistoryDate,
  shiftJstDateString,
  worksNewsSearchDocIdForJstDate,
  WORKS_NEWS_HISTORY_DAYS,
} from "./server/works-news-search-store";

{
  assert.equal(shiftJstDateString("2026-09-22", -1), "2026-09-21");
  assert.equal(shiftJstDateString("2026-09-01", -1), "2026-08-31");
  assert.equal(shiftJstDateString("2026-01-01", -1), "2025-12-31");
  assert.equal(WORKS_NEWS_HISTORY_DAYS, 7);
}

{
  const now = new Date("2026-09-22T03:00:00Z"); // JST 12:00 9/22
  assert.equal(isAllowedWorksNewsHistoryDate("2026-09-22", now), true);
  assert.equal(isAllowedWorksNewsHistoryDate("2026-09-16", now), true);
  assert.equal(isAllowedWorksNewsHistoryDate("2026-09-15", now), false);
  assert.equal(isAllowedWorksNewsHistoryDate("2026-09-23", now), false);
  assert.equal(isAllowedWorksNewsHistoryDate("nope", now), false);
}

{
  assert.equal(
    worksNewsSearchDocIdForJstDate("2026-09-20"),
    "works-news-search-2026-09-20",
  );
}

console.log("works-news-search-history.test.ts: ok");
