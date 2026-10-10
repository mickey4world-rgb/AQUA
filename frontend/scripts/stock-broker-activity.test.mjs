import assert from "node:assert/strict";
import {
  buildStockBrokerActivity,
  STOCK_IDLE_CHECK_SYMBOL,
} from "../lib/stock-broker-activity.ts";

const snapshot = {
  id: "snap",
  userId: "u",
  broker: "kabu",
  syncedAt: "2026-10-02T03:00:00.000Z",
  cash: { stockAccountWallet: 800_000 },
  holdings: [],
  rawPositionCount: 0,
  updatedAt: "2026-10-02T03:00:00.000Z",
  bridgeMeta: { allowLiveOrders: true, kabuPort: 18080 },
};

const now = new Date("2026-10-02T03:00:00.000Z");

const empty = buildStockBrokerActivity({
  orders: [],
  snapshot,
  activeWatchCount: 8,
  allowLiveOrders: true,
  now,
});
assert.equal(empty.today.tradeCount, 0);
assert.ok(empty.diagnosis.reasons.length >= 2);
assert.equal(empty.diagnosis.holdingsCount, 0);
assert.equal(empty.diagnosis.cashYen, 800_000);
assert.equal(empty.diagnosis.lastBuySkipsSummary, null);

const withCheck = buildStockBrokerActivity({
  orders: [
    {
      id: "1",
      userId: "u",
      intentId: "idle",
      side: "buy",
      symbol: STOCK_IDLE_CHECK_SYMBOL,
      exchange: 1,
      qty: 0,
      status: "skipped",
      dryRun: false,
      reason: "条件未達・見送り（点検）",
      message:
        "intents=0 sessionGuess=true policy=C2; buySkips=7203:Path A 非該当 | 6758:余力不足",
      createdAt: "2026-10-02T02:10:00.000Z",
    },
  ],
  snapshot,
  activeWatchCount: 8,
  allowLiveOrders: true,
  now,
});
assert.equal(withCheck.today.tradeCount, 0);
assert.equal(withCheck.today.checkCount, 1);
assert.ok(withCheck.todayHourly.some((b) => b.checkCount > 0));
assert.equal(
  withCheck.diagnosis.lastBuySkipsSummary,
  "7203:Path A 非該当 | 6758:余力不足",
);
assert.ok(
  withCheck.diagnosis.reasons.some((r) => r.includes("7203:Path A 非該当")),
);

console.log("stock-broker-activity.test.mjs OK");
