import assert from "node:assert/strict";
import type { StockBrokerOrderRecord } from "./types/stock-broker-trade";
import {
  enrichBrokerOrdersForRealizedPnl,
  estimateSellRealizedPnlYen,
  formatSellRealizedForecast,
  parseForecastRealizedPnlYen,
} from "./stock-realized-pnl";

function order(
  partial: Partial<StockBrokerOrderRecord> &
    Pick<StockBrokerOrderRecord, "id" | "side" | "symbol" | "qty" | "status">,
): StockBrokerOrderRecord {
  return {
    userId: "u1",
    intentId: `i-${partial.id}`,
    exchange: 27,
    dryRun: partial.status === "dry_run",
    reason: "",
    createdAt: "2026-10-20T01:00:00.000Z",
    ...partial,
  };
}

const forecastLoss = formatSellRealizedForecast({
  costPriceYen: 1500,
  markPriceYen: 1450,
  qty: 100,
});
assert.match(forecastLoss, /実現見込み-5000円/);
assert.equal(parseForecastRealizedPnlYen(forecastLoss), -5000);

assert.equal(
  estimateSellRealizedPnlYen({
    order: order({
      id: "1",
      side: "sell",
      symbol: "7203",
      qty: 100,
      status: "submitted",
      realizedPnlYen: -5000,
      reason: "実現見込み-999円",
    }),
  }),
  -5000,
  "stored realizedPnlYen wins",
);

assert.equal(
  estimateSellRealizedPnlYen({
    order: order({
      id: "2",
      side: "sell",
      symbol: "9984",
      qty: 100,
      status: "submitted",
      reason: `即損切り ${forecastLoss} — AI売り`,
    }),
  }),
  -5000,
  "reason から昨日の赤字を復元",
);

const enriched = enrichBrokerOrdersForRealizedPnl([
  order({
    id: "buy1",
    side: "buy",
    symbol: "6758",
    qty: 100,
    status: "submitted",
    priceYen: 2000,
    createdAt: "2026-10-20T00:30:00.000Z",
  }),
  order({
    id: "sell1",
    side: "sell",
    symbol: "6758",
    qty: 100,
    status: "submitted",
    reason: `即損切り ${formatSellRealizedForecast({
      costPriceYen: 2000,
      markPriceYen: 1900,
      qty: 100,
    })}`,
    createdAt: "2026-10-20T01:00:00.000Z",
  }),
]);
assert.equal(
  enriched.find((o) => o.id === "sell1")?.realizedPnlYen,
  -10_000,
  "enrich 後にグラフ／表へ載る",
);

console.log("stock-realized-pnl.test.ts: ok");
