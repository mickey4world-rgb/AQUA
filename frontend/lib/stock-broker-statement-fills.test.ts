import assert from "node:assert/strict";
import { buildStockEquityPerformance } from "./stock-equity-performance";
import {
  assignStatementRealizedPnl,
  mergeStockBrokerOrdersWithStatementFills,
  oct20StatementRealizedPnlYen,
  statementFillsToOrders,
  STOCK_BROKER_STATEMENT_FILLS,
} from "./stock-broker-statement-fills";

const oct20 = assignStatementRealizedPnl(
  STOCK_BROKER_STATEMENT_FILLS.filter((f) => f.jstAt.startsWith("2026-10-20")),
);
const sells = oct20.filter((f) => f.side === "sell");
assert.equal(sells.length, 3, "10/20 売りは3件");
assert.equal(
  sells.find((s) => s.symbol === "6526")?.realizedPnlYen,
  -180,
  "6526 受渡実現",
);
assert.equal(
  sells.find((s) => s.symbol === "1963")?.realizedPnlYen,
  -1_900,
  "1963 受渡実現",
);
assert.equal(
  sells.find((s) => s.symbol === "3903")?.realizedPnlYen,
  -410,
  "3903 受渡実現",
);
assert.equal(oct20StatementRealizedPnlYen(), -2_490, "10/20 合計赤字");

const orders = statementFillsToOrders("user-test");
const equity = buildStockEquityPerformance({
  orders,
  principalYen: 1_000_000,
  nowIso: "2026-10-23T12:00:00.000Z",
});
assert.equal(equity.pnlYen, -2_490, "累積実現に20日の損が入る");
const oct20Point = equity.points.find((p) => p.date === "2026-10-20");
assert.ok(oct20Point, "10/20 の点がある");
assert.equal(oct20Point?.pnlYen, -2_490);

const merged = mergeStockBrokerOrdersWithStatementFills([], "user-test");
assert.equal(merged.filter((o) => o.status === "submitted").length, orders.length);
assert.ok(merged.some((o) => o.symbol === "4755" && o.side === "buy"));

console.log("stock-broker-statement-fills.test.ts: ok");
