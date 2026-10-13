import assert from "node:assert/strict";
import {
  isJpEquityMarketHours,
  isJpEquityTradeWindow,
  jstSessionClock,
  JP_EQUITY_CLOSE_MINS,
} from "./stock-jp-session";
import { isJpEquityExchangeHoliday } from "./stock-jp-holidays";

function atJst(isoUtc: string) {
  return new Date(isoUtc);
}

assert.equal(JP_EQUITY_CLOSE_MINS, 15 * 60 + 30, "TSE close is 15:30");

// 2026-10-08 Thu
const thu1445 = atJst("2026-10-08T05:45:00.000Z"); // 14:45 JST
const thu1446 = atJst("2026-10-08T05:46:00.000Z"); // 14:46 JST
const thu1500 = atJst("2026-10-08T06:00:00.000Z"); // 15:00 JST
const thu1515 = atJst("2026-10-08T06:15:00.000Z"); // 15:15 JST
const thu1516 = atJst("2026-10-08T06:16:00.000Z"); // 15:16 JST
const thu1524 = atJst("2026-10-08T06:24:00.000Z"); // 15:24 JST — 当日の誤「市場外」再現
const thu1530 = atJst("2026-10-08T06:30:00.000Z"); // 15:30 JST
const thu1531 = atJst("2026-10-08T06:31:00.000Z"); // 15:31 JST
const thu1230 = atJst("2026-10-08T03:30:00.000Z"); // 12:30 JST
const thu1200 = atJst("2026-10-08T03:00:00.000Z"); // 12:00 JST lunch
const thu0910 = atJst("2026-10-08T00:10:00.000Z"); // 09:10 JST blackout
const thu0920 = atJst("2026-10-08T00:20:00.000Z"); // 09:20 JST

assert.equal(jstSessionClock(thu1445).hour, 14);
assert.equal(jstSessionClock(thu1445).minute, 45);

// 後場は 15:30 まで市場時間（UI）
assert.equal(isJpEquityMarketHours(thu1445), true, "14:45 market");
assert.equal(isJpEquityMarketHours(thu1446), true, "14:46 market");
assert.equal(isJpEquityMarketHours(thu1500), true, "15:00 market");
assert.equal(isJpEquityMarketHours(thu1524), true, "15:24 still market (not 市場外)");
assert.equal(isJpEquityMarketHours(thu1530), true, "15:30 market");
assert.equal(isJpEquityMarketHours(thu1531), false, "15:31 closed");

// 発注窓は大引け前15分を除外 — 15:15 まで可、15:16 以降は不可
assert.equal(isJpEquityTradeWindow(thu1445), true, "14:45 trade ok");
assert.equal(isJpEquityTradeWindow(thu1446), true, "14:46 trade ok under 15:30 close");
assert.equal(isJpEquityTradeWindow(thu1500), true, "15:00 trade ok");
assert.equal(isJpEquityTradeWindow(thu1515), true, "15:15 trade boundary");
assert.equal(isJpEquityTradeWindow(thu1516), false, "15:16 trade blackout");
assert.equal(isJpEquityTradeWindow(thu1530), false, "15:30 trade blackout");

// 昼休みは市場外
assert.equal(isJpEquityMarketHours(thu1200), false, "lunch");
assert.equal(isJpEquityMarketHours(thu1230), true, "pm open");

// 寄りブラックアウト: 市場時間だが発注不可
assert.equal(isJpEquityMarketHours(thu0910), true);
assert.equal(isJpEquityTradeWindow(thu0910), false);
assert.equal(isJpEquityTradeWindow(thu0920), true);

// 2026-10-12 Mon スポーツの日 — 東証現物休場（平日でも市場外）
const sportsDay1015 = atJst("2026-10-12T01:15:00.000Z"); // 10:15 JST
assert.equal(isJpEquityExchangeHoliday(sportsDay1015), true, "Sports Day holiday");
assert.equal(isJpEquityMarketHours(sportsDay1015), false, "Sports Day not market hours");
assert.equal(isJpEquityTradeWindow(sportsDay1015), false, "Sports Day no trade window");

console.log("stock-jp-session.test.ts: ok");
