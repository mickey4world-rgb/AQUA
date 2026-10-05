import assert from "node:assert/strict";
import {
  isBearishDipBounceBuy,
  isTrendPathBuyEligible,
  smallInvestBuyCapYen,
} from "./stock-buy-eligibility";
import {
  maxDipBuysForWatchCount,
  STOCK_DIP_BUY_SHARE_WHEN_CROWDED,
  STOCK_LOT_SIZE,
  STOCK_SMALL_TRADE_YEN,
} from "./stock-trade-constants";
import {
  isMemoBuyBetterThanActive,
  stockBuySignalPriority,
} from "./stock-buy-priority";

// --- #8 部分解禁 ---
assert.ok(
  isBearishDipBounceBuy({
    action: "buy",
    trend: "bearish",
    rsi14: 27,
    nearWeekLow: true,
    dipBuyEligible: true,
  }),
);
assert.ok(
  !isBearishDipBounceBuy({
    action: "buy",
    trend: "bearish",
    rsi14: 40,
    nearWeekLow: true,
  }),
);
assert.ok(
  isTrendPathBuyEligible({ action: "buy", trend: "bullish" }),
);
assert.ok(
  isTrendPathBuyEligible({
    action: "buy",
    trend: "bearish",
    rsi14: 28,
    nearMonthLow: true,
  }),
);
assert.ok(
  !isTrendPathBuyEligible({ action: "hold", trend: "bearish", rsi14: 25 }),
);

// --- #46 少額でも安値1単元 ---
assert.equal(
  smallInvestBuyCapYen({
    smallInvestMode: true,
    mode: "dip",
    price: 659,
    smallTradeYen: STOCK_SMALL_TRADE_YEN,
    lotSize: STOCK_LOT_SIZE,
    allowDipOneLot: true,
  }),
  659 * STOCK_LOT_SIZE,
);
assert.equal(
  smallInvestBuyCapYen({
    smallInvestMode: true,
    mode: "trend",
    price: 659,
    smallTradeYen: STOCK_SMALL_TRADE_YEN,
    lotSize: STOCK_LOT_SIZE,
    allowDipOneLot: true,
  }),
  STOCK_SMALL_TRADE_YEN,
);
assert.ok(
  smallInvestBuyCapYen({
    smallInvestMode: false,
    mode: "dip",
    price: 659,
    smallTradeYen: STOCK_SMALL_TRADE_YEN,
    lotSize: STOCK_LOT_SIZE,
    allowDipOneLot: true,
  }) === Number.POSITIVE_INFINITY,
);

// --- #44 混み日枠拡大 ---
assert.equal(maxDipBuysForWatchCount(4), 2);
assert.equal(maxDipBuysForWatchCount(4, 1), 2); // 1/4 < 0.5 → 通常
assert.equal(maxDipBuysForWatchCount(4, 2), 3); // 2/4 >= 0.5 → 75%
assert.equal(maxDipBuysForWatchCount(4, 3), 3);
assert.equal(STOCK_DIP_BUY_SHARE_WHEN_CROWDED, 0.75);

// --- #45 コア slack ---
assert.ok(isMemoBuyBetterThanActive(180, 170));
assert.ok(!isMemoBuyBetterThanActive(170, 170));
assert.ok(
  isMemoBuyBetterThanActive(150, 170, { isCore: true }),
  "コアは slack 30 以内なら可",
);
assert.ok(!isMemoBuyBetterThanActive(130, 170, { isCore: true }));

assert.ok(
  stockBuySignalPriority({
    action: "buy",
    trend: "bearish",
    rsi14: 27,
    nearWeekLow: true,
    dipScore: 80,
  }) > 500,
);

console.log("stock-buy-eligibility.test.ts: ok");
