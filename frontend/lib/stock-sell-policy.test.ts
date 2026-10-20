/**
 * Run from frontend/: npx --yes tsx --tsconfig tsconfig.json lib/stock-sell-policy.test.ts
 * (path aliases may need the app runner; logic is pure)
 */
import assert from "node:assert/strict";
import {
  decideStockSellIntent,
  earliestStockBuyAtMs,
  STOCK_STOP_LOSS_MIN_HOLD_MS,
} from "./stock-sell-policy";
import type { StockBrokerOrderRecord } from "./types/stock-broker-trade";

function buyOrder(symbol: string, createdAt: string): StockBrokerOrderRecord {
  return {
    id: "b1",
    userId: "u",
    intentId: "i",
    side: "buy",
    symbol,
    exchange: 27,
    qty: 100,
    status: "submitted",
    dryRun: false,
    reason: "t",
    createdAt,
  };
}

const now = Date.parse("2026-10-20T06:00:00.000Z");

{
  // 10分前に買った銘柄を赤字で売らない
  const boughtAt = new Date(now - 10 * 60_000).toISOString();
  const orders = [buyOrder("7203", boughtAt)];
  assert.equal(earliestStockBuyAtMs(orders, "7203"), Date.parse(boughtAt));
  const d = decideStockSellIntent({
    symbol: "7203",
    buyPrice: 1000,
    currentPrice: 900,
    adviceAction: "sell",
    targetPrice: 1200,
    preferEarlierTakeProfit: true,
    orders,
    nowMs: now,
  });
  assert.equal(d, null, "underwater + fresh hold must not sell");
}

{
  // プラス圏のAI売りは可
  const boughtAt = new Date(now - 10 * 60_000).toISOString();
  const d = decideStockSellIntent({
    symbol: "7203",
    buyPrice: 1000,
    currentPrice: 1050,
    adviceAction: "sell",
    targetPrice: 1200,
    preferEarlierTakeProfit: false,
    orders: [buyOrder("7203", boughtAt)],
    nowMs: now,
  });
  assert.ok(d);
  assert.equal(d!.kind, "take-profit");
}

{
  // 1年超・深い含み損のみ損切り
  const boughtAt = new Date(now - STOCK_STOP_LOSS_MIN_HOLD_MS - 86_400_000).toISOString();
  const d = decideStockSellIntent({
    symbol: "7203",
    buyPrice: 1000,
    currentPrice: 700,
    adviceAction: "hold",
    targetPrice: 1200,
    preferEarlierTakeProfit: false,
    orders: [buyOrder("7203", boughtAt)],
    nowMs: now,
  });
  assert.ok(d);
  assert.equal(d!.kind, "stop-loss");
}

{
  // 保有不明＝1年未満扱い → 損切りしない
  const d = decideStockSellIntent({
    symbol: "9999",
    buyPrice: 1000,
    currentPrice: 700,
    adviceAction: "sell",
    targetPrice: 0,
    preferEarlierTakeProfit: false,
    orders: [],
    nowMs: now,
  });
  assert.equal(d, null);
}

console.log("stock-sell-policy.test.ts: ok");
