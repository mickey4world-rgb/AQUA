import assert from "node:assert/strict";
import {
  buildStockPortfolioOverview,
  buildStockProductProjections,
  STOCK_SOFT_TAKE_PROFIT_RATE,
} from "./stock-portfolio-overview";
import type { StockBrokerSnapshot } from "./types/stock-broker";
import type { StockEquityPerformance } from "./stock-equity-performance";

const snapshot: StockBrokerSnapshot = {
  id: "broker-u1",
  userId: "u1",
  broker: "kabu",
  syncedAt: "2026-10-27T02:00:00.000Z",
  cash: { stockAccountWallet: 300_000 },
  holdings: [
    {
      symbol: "3903",
      symbolName: "gumi",
      exchange: 27,
      qty: 100,
      price: 200,
      averagePrice: 190,
    },
  ],
  rawPositionCount: 1,
  updatedAt: "2026-10-27T02:00:00.000Z",
};

const equity: StockEquityPerformance = {
  principalYen: 800_000,
  monthlyTargetYen: 16_000,
  currentTotalYen: 797_510,
  pnlYen: -2_490,
  pnlPct: -0.31125,
  monthlyRealizedPnlYen: -2_490,
  monthlyProgressPct: -15.5625,
  points: [],
  markers: [],
};

const overview = buildStockPortfolioOverview({ snapshot, equity });
assert.equal(overview.cashYen, 300_000);
assert.equal(overview.holdingsValueYen, 20_000);
assert.equal(overview.totalYen, 320_000);
assert.equal(overview.realizedPnlYen, -2_490);
assert.ok(overview.targetProgressPct < 0);

const projs = buildStockProductProjections({
  snapshot,
  watches: [],
  orders: [],
});
assert.equal(projs.length, 1);
assert.equal(projs[0].avgBuyPriceYen, 190);
assert.equal(
  projs[0].targetSellSoftYen,
  Math.round(190 * (1 + STOCK_SOFT_TAKE_PROFIT_RATE)),
);
assert.equal(projs[0].targetSellHardYen, Math.round(190 * 1.2));
assert.equal(projs[0].expectedProfitHardYen, Math.round((228 - 190) * 100));

console.log("stock-portfolio-overview.test.ts: ok");
