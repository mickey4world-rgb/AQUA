import assert from "node:assert/strict";

/** getSolunaOpsAnalyticsReport と同じ判定（新鮮なキャッシュだけ採用） */
function shouldServeCachedOps(input: {
  cacheAgeMs: number;
  freshTtlMs: number;
  hasEquityPerformance: boolean;
}): boolean {
  if (!input.hasEquityPerformance) return false;
  return input.cacheAgeMs <= input.freshTtlMs;
}

assert.equal(
  shouldServeCachedOps({
    cacheAgeMs: 5 * 60 * 1000,
    freshTtlMs: 20 * 60 * 1000,
    hasEquityPerformance: true,
  }),
  true,
);

// 再発: 24h stale を equity があるだけで返すと Note/BOINC が止まる
assert.equal(
  shouldServeCachedOps({
    cacheAgeMs: 60 * 60 * 1000,
    freshTtlMs: 20 * 60 * 1000,
    hasEquityPerformance: true,
  }),
  false,
);

assert.equal(
  shouldServeCachedOps({
    cacheAgeMs: 0,
    freshTtlMs: 20 * 60 * 1000,
    hasEquityPerformance: false,
  }),
  false,
);

console.log("soluna-ops-cache-freshness.test.ts: ok");
