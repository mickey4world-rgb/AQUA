import assert from "node:assert/strict";
import {
  isMemoBuyBetterThanActive,
  stockBuySignalPriority,
} from "./stock-buy-priority";

assert.equal(
  stockBuySignalPriority({ action: "hold", trend: "bearish" }),
  0,
);
assert.ok(
  stockBuySignalPriority({
    action: "buy",
    trend: "bullish",
  }) >
    stockBuySignalPriority({
      dipBuyEligible: true,
      dipScore: 80,
    }),
);
assert.equal(
  stockBuySignalPriority({ dipBuyEligible: true, dipScore: 70 }),
  170,
);

assert.ok(isMemoBuyBetterThanActive(180, 170));
assert.ok(!isMemoBuyBetterThanActive(170, 170));
assert.ok(isMemoBuyBetterThanActive(50, 0));
assert.ok(!isMemoBuyBetterThanActive(0, 0));

console.log("stock-buy-priority.test.ts: ok");
