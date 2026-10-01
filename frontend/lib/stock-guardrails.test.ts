/**
 * Run: npx --yes tsx lib/stock-guardrails.test.ts
 */
import assert from "node:assert/strict";
import {
  evaluateStockGuardrails,
  isPerTradeLossBreached,
  maxNotionalForPerTradeLoss,
} from "./stock-guardrails";
import type { StockBrokerOrderRecord } from "./types/stock-broker-trade";

function order(
  partial: Partial<StockBrokerOrderRecord> & {
    realizedPnlYen: number;
    createdAt: string;
  },
): StockBrokerOrderRecord {
  return {
    id: partial.id ?? "o1",
    userId: "u",
    intentId: "i",
    side: "sell",
    symbol: "7203",
    exchange: 1,
    qty: 100,
    status: "dry_run",
    dryRun: true,
    reason: "t",
    createdAt: partial.createdAt,
    realizedPnlYen: partial.realizedPnlYen,
  };
}

{
  const cap = maxNotionalForPerTradeLoss(-0.08, 15_000);
  assert.equal(cap, Math.floor(15_000 / 0.08));
}

assert.equal(
  isPerTradeLossBreached({
    buyPrice: 1000,
    currentPrice: 800,
    qty: 100,
    maxLossYen: 15_000,
  }),
  true,
);

assert.equal(
  isPerTradeLossBreached({
    buyPrice: 1000,
    currentPrice: 950,
    qty: 100,
    maxLossYen: 15_000,
    stopRate: -0.08,
  }),
  false,
);

{
  const g = evaluateStockGuardrails({
    orders: [
      order({ realizedPnlYen: -20_000, createdAt: "2026-10-01T01:00:00Z" }),
      order({ realizedPnlYen: -30_000, createdAt: "2026-10-02T01:00:00Z" }),
    ],
    nowIso: "2026-10-03T01:00:00Z",
  });
  assert.equal(g.monthlyHalt, true);
  assert.equal(g.mainBreaker, false);
}

{
  const g = evaluateStockGuardrails({
    orders: [
      order({ realizedPnlYen: -120_000, createdAt: "2026-08-01T01:00:00Z" }),
      order({ realizedPnlYen: -90_000, createdAt: "2026-09-01T01:00:00Z" }),
    ],
    nowIso: "2026-10-03T01:00:00Z",
  });
  assert.equal(g.mainBreaker, true);
  assert.ok(g.cumulativeLossYen >= 200_000);
}

console.log("stock-guardrails.test.ts: ok");
