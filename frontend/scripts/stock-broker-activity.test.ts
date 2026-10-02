import assert from "node:assert/strict";
import {
  buildStockBrokerActivity,
  STOCK_IDLE_CHECK_SYMBOL,
} from "../lib/stock-broker-activity";

const snapshot = {
  id: "snap",
  userId: "u",
  broker: "kabu" as const,
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

const withCheck = buildStockBrokerActivity({
  orders: [
    {
      id: "1",
      userId: "u",
      intentId: "idle",
      side: "buy" as const,
      symbol: STOCK_IDLE_CHECK_SYMBOL,
      exchange: 1,
      qty: 0,
      status: "skipped" as const,
      dryRun: false,
      reason: "条件未達・見送り（点検）",
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

console.log("stock-broker-activity.test OK");
