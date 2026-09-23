/**
 * Run: npx --yes tsx lib/works-news-search-display.test.ts
 */
import assert from "node:assert/strict";
import {
  formatWorksNewsFetchedAtJst,
  worksNewsDigestJstDate,
} from "./works-news-search-display";

{
  // 本番障害: UTC slice → 「昨日 19:13」、実体は当日 04:13 JST
  const iso = "2026-09-23T19:13:09.020Z";
  const label = formatWorksNewsFetchedAtJst(iso);
  assert.match(label, /2026\/09\/24/);
  assert.match(label, /04:13/);
  assert.doesNotMatch(label, /09\/23/);
}

{
  assert.equal(
    worksNewsDigestJstDate("works-news-search-2026-09-24"),
    "2026-09-24",
  );
  assert.equal(worksNewsDigestJstDate("bogus"), null);
  assert.equal(worksNewsDigestJstDate(null), null);
}

console.log("works-news-search-display.test.ts: ok");
