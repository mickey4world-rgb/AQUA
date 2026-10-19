/**
 * Premarket / Verify oracle: cash buy+sell shapes must pass invariants.
 * Exit 0 + TRADE_SHAPE_OK only when Exchange∉{1}, FundType, DelivType, CashMargin ok.
 */
import {
  assertCashOrderShape,
  normalizeCashExchange,
  CASH_EXCHANGES_ALLOWED,
} from "./cash-order-shape.mjs";

function fail(msg) {
  console.error("TRADE_SHAPE_BAD " + msg);
  process.exit(1);
}

// Preferred=1 must never win (env/learned poison)
if (normalizeCashExchange(1, 1) !== 27) {
  fail("normalizeCashExchange(1,1) must be 27");
}
if (normalizeCashExchange(0, 9) !== 9) {
  fail("normalizeCashExchange(0,9) must be 9");
}
if (normalizeCashExchange(27, 1) !== 27) {
  fail("normalizeCashExchange(27,1) must keep 27");
}

const buy = {
  Password: "x",
  Symbol: "1301",
  Exchange: normalizeCashExchange(1, 27),
  SecurityType: 1,
  Side: "2",
  CashMargin: 1,
  DelivType: 2,
  FundType: "02",
  AccountType: 4,
  Qty: 100,
  FrontOrderType: 10,
  Price: 0,
  ExpireDay: 0,
};
const sell = {
  ...buy,
  Side: "1",
  DelivType: 0,
  FundType: "  ",
};

const buyCheck = assertCashOrderShape(buy);
if (!buyCheck.ok) fail("buy: " + buyCheck.errors.join("; "));

const sellCheck = assertCashOrderShape(sell);
if (!sellCheck.ok) fail("sell: " + sellCheck.errors.join("; "));

const badEx = { ...buy, Exchange: 1 };
const badCheck = assertCashOrderShape(badEx);
if (badCheck.ok) fail("Exchange=1 must fail assert");

const badFund = { ...buy, FundType: "AA" };
const badFundCheck = assertCashOrderShape(badFund, { allowCreditFund: false });
if (badFundCheck.ok) fail("FundType=AA without credit must fail assert");

if (!CASH_EXCHANGES_ALLOWED.includes(buy.Exchange)) {
  fail("buy Exchange not in allowed set");
}

console.log(
  `TRADE_SHAPE_OK buyEx=${buy.Exchange} sellFund=${JSON.stringify(sell.FundType)} allowed=${CASH_EXCHANGES_ALLOWED.join(",")}`,
);
process.exit(0);
