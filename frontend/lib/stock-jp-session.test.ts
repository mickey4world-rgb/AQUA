import assert from "node:assert/strict";
import {
  isJpEquityMarketHours,
  isJpEquityTradeWindow,
  jstSessionClock,
} from "./stock-jp-session";

function atJst(isoUtc: string) {
  return new Date(isoUtc);
}

// 2026-10-08 Thu
const thu1445 = atJst("2026-10-08T05:45:00.000Z"); // 14:45 JST
const thu1446 = atJst("2026-10-08T05:46:00.000Z"); // 14:46 JST
const thu1500 = atJst("2026-10-08T06:00:00.000Z"); // 15:00 JST
const thu1501 = atJst("2026-10-08T06:01:00.000Z"); // 15:01 JST
const thu1230 = atJst("2026-10-08T03:30:00.000Z"); // 12:30 JST
const thu1200 = atJst("2026-10-08T03:00:00.000Z"); // 12:00 JST lunch
const thu0910 = atJst("2026-10-08T00:10:00.000Z"); // 09:10 JST blackout
const thu0920 = atJst("2026-10-08T00:20:00.000Z"); // 09:20 JST

assert.equal(jstSessionClock(thu1445).hour, 14);
assert.equal(jstSessionClock(thu1445).minute, 45);

// 後場は市場時間（UI）— 14:45 / 14:46 / 15:00 は場中
assert.equal(isJpEquityMarketHours(thu1445), true, "14:45 market");
assert.equal(isJpEquityMarketHours(thu1446), true, "14:46 market");
assert.equal(isJpEquityMarketHours(thu1500), true, "15:00 market");
assert.equal(isJpEquityMarketHours(thu1501), false, "15:01 closed");

// 発注窓は大引け前15分を除外 — 14:45 以降は tradeWindow=false
assert.equal(isJpEquityTradeWindow(thu1445), true, "14:45 still at boundary");
assert.equal(isJpEquityTradeWindow(thu1446), false, "14:46 trade blackout");
assert.equal(isJpEquityTradeWindow(thu1500), false, "15:00 trade blackout");

// 昼休みは市場外
assert.equal(isJpEquityMarketHours(thu1200), false, "lunch");
assert.equal(isJpEquityMarketHours(thu1230), true, "pm open");

// 寄りブラックアウト: 市場時間だが発注不可
assert.equal(isJpEquityMarketHours(thu0910), true);
assert.equal(isJpEquityTradeWindow(thu0910), false);
assert.equal(isJpEquityTradeWindow(thu0920), true);

console.log("stock-jp-session.test.ts: ok");
