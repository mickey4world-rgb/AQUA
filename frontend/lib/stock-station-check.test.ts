import assert from "node:assert/strict";
import { buildStockStationCheck } from "./stock-station-check";
import type { StockBrokerSnapshot } from "./types/stock-broker";

const now = new Date("2026-10-06T01:00:00Z");

{
  const snap: StockBrokerSnapshot = {
    id: "broker-u",
    userId: "u",
    broker: "kabu",
    syncedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    cash: { stockAccountWallet: 1 },
    holdings: [],
    rawPositionCount: 0,
    bridgeMeta: {
      allowLiveOrders: true,
      kabuPort: 18080,
      stationReachable: true,
      stationTokenOk: true,
      lastError: null,
      healthReportedAt: new Date(now.getTime() - 3 * 60_000).toISOString(),
    },
    updatedAt: now.toISOString(),
  };
  const view = buildStockStationCheck({ snapshot: snap, orders: [], now });
  assert.equal(view.overallOk, true);
  assert.equal(
    view.items.find((i) => i.id === "station-login")?.ok,
    true,
  );
}

{
  const snap: StockBrokerSnapshot = {
    id: "broker-u",
    userId: "u",
    broker: "kabu",
    syncedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    cash: { stockAccountWallet: 1 },
    holdings: [],
    rawPositionCount: 0,
    bridgeMeta: {
      allowLiveOrders: false,
      kabuPort: 18081,
      stationReachable: true,
      stationTokenOk: false,
      lastError: "kabu token failed: HTTP 401",
      healthReportedAt: new Date(now.getTime() - 2 * 60_000).toISOString(),
    },
    updatedAt: now.toISOString(),
  };
  const view = buildStockStationCheck({ snapshot: snap, orders: [], now });
  assert.equal(view.overallOk, false);
  assert.equal(
    view.items.find((i) => i.id === "station-login")?.ok,
    false,
  );
}

console.log("stock-station-check.test.ts: ok");
