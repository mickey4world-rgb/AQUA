import assert from "node:assert/strict";
import { buildStockVmRuntimeStatus } from "./stock-vm-status";
import type { StockBrokerSnapshot } from "./types/stock-broker";
import type { StockBrokerOrderRecord } from "./types/stock-broker-trade";

function snap(syncedAt: string): StockBrokerSnapshot {
  return {
    id: "s1",
    userId: "u1",
    broker: "kabu",
    syncedAt,
    cash: { stockAccountWallet: 100_000 },
    holdings: [],
    rawPositionCount: 0,
    bridgeMeta: { allowLiveOrders: true, kabuPort: 18080 },
    updatedAt: syncedAt,
  };
}

function order(createdAt: string): StockBrokerOrderRecord {
  return {
    id: "o1",
    userId: "u1",
    intentId: "i1",
    side: "buy",
    symbol: "_CHECK_",
    qty: 0,
    status: "skipped",
    createdAt,
  } as StockBrokerOrderRecord;
}

// 未同期
{
  const s = buildStockVmRuntimeStatus({ snapshot: null, orders: [] });
  assert.equal(s.state, "unknown");
  assert.equal(s.label, "未同期");
}

// 直近 sync → 稼働中（後場）
{
  const now = new Date("2026-10-08T05:45:00Z"); // 木 14:45 JST 後場
  const syncedAt = new Date(now.getTime() - 10 * 60_000).toISOString();
  const s = buildStockVmRuntimeStatus({
    snapshot: snap(syncedAt),
    orders: [order(syncedAt)],
    now,
  });
  assert.equal(s.sessionOpenNow, true, "14:45 is market hours");
  assert.equal(s.state, "running");
  assert.equal(s.label, "稼働中");
}

// 後場なのに sync 2時間枯れ → 停止疑い（市場外と偽らない）
{
  const now = new Date("2026-10-08T05:45:00Z"); // 14:45 JST
  const syncedAt = new Date(now.getTime() - 2 * 3600_000).toISOString(); // 12:45
  const s = buildStockVmRuntimeStatus({
    snapshot: snap(syncedAt),
    orders: [],
    now,
  });
  assert.equal(s.sessionOpenNow, true);
  assert.equal(s.state, "stale");
  assert.ok(s.label.includes("場中") || s.label.includes("停止"));
  assert.ok(!s.label.includes("市場外"));
  assert.ok(s.detail.includes("市場外ではありません") || s.detail.includes("ザラ場中"));
}

// 14:46 もザラ場中（発注ブラックアウトと分離）
{
  const now = new Date("2026-10-08T05:46:00Z");
  const syncedAt = new Date(now.getTime() - 5 * 60_000).toISOString();
  const s = buildStockVmRuntimeStatus({
    snapshot: snap(syncedAt),
    orders: [order(syncedAt)],
    now,
  });
  assert.equal(s.sessionOpenNow, true);
  assert.equal(s.state, "running");
}

// 週末で半日以内 → 待機OK
{
  const now = new Date("2026-10-04T03:00:00Z"); // 土 12:00 JST
  const syncedAt = new Date(now.getTime() - 6 * 3600_000).toISOString();
  const s = buildStockVmRuntimeStatus({
    snapshot: snap(syncedAt),
    orders: [order(syncedAt)],
    now,
  });
  assert.equal(s.sessionOpenNow, false);
  assert.equal(s.state, "idle_ok");
  assert.ok(s.label.includes("待機"));
}

console.log("stock-vm-status.test.ts: ok");
