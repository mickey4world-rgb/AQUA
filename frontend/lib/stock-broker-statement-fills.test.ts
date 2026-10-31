// 完全架空・実在組織／人名禁止（銘柄コード・名称・金額はすべてテスト用）
import assert from "node:assert/strict";
import { buildStockEquityPerformance } from "./stock-equity-performance";
import {
  assignStatementRealizedPnl,
  loadStatementFills,
  mergeStockBrokerOrdersWithStatementFills,
  parseStatementFillsSetting,
  statementFillsToOrders,
  statementRealizedPnlYenForDay,
  type StockBrokerStatementFill,
} from "./stock-broker-statement-fills";

const FIXTURE: StockBrokerStatementFill[] = [
  { jstAt: "2030-01-07 09:15:00", symbol: "9001", symbolName: "サンプル工業", side: "buy", priceYen: 1_000, qty: 100, settlementYen: 100_150 },
  { jstAt: "2030-01-07 09:15:00", symbol: "9002", symbolName: "デモ電機", side: "buy", priceYen: 2_000, qty: 100, settlementYen: 200_200 },
  { jstAt: "2030-01-07 09:15:00", symbol: "9003", symbolName: "フィクション商事", side: "buy", priceYen: 200, qty: 100, settlementYen: 20_050 },
  { jstAt: "2030-01-07 09:20:00", symbol: "9001", symbolName: "サンプル工業", side: "sell", priceYen: 1_000, qty: 100, settlementYen: 99_970 },
  { jstAt: "2030-01-07 09:20:00", symbol: "9002", symbolName: "デモ電機", side: "sell", priceYen: 1_985, qty: 100, settlementYen: 198_300 },
  { jstAt: "2030-01-07 12:30:00", symbol: "9003", symbolName: "フィクション商事", side: "sell", priceYen: 196, qty: 100, settlementYen: 19_640 },
  { jstAt: "2030-01-08 09:15:00", symbol: "9004", symbolName: "テスト物産", side: "buy", priceYen: 500, qty: 100, settlementYen: 50_050 },
];

const day1 = assignStatementRealizedPnl(
  FIXTURE.filter((f) => f.jstAt.startsWith("2030-01-07")),
);
const sells = day1.filter((f) => f.side === "sell");
assert.equal(sells.length, 3);
assert.equal(sells.find((s) => s.symbol === "9001")?.realizedPnlYen, -180);
assert.equal(sells.find((s) => s.symbol === "9002")?.realizedPnlYen, -1_900);
assert.equal(sells.find((s) => s.symbol === "9003")?.realizedPnlYen, -410);
assert.equal(statementRealizedPnlYenForDay(FIXTURE, "2030-01-07"), -2_490);

const orders = statementFillsToOrders("user-test", FIXTURE);
const equity = buildStockEquityPerformance({
  orders,
  principalYen: 1_000_000,
  nowIso: "2030-01-08T12:00:00.000Z",
});
assert.equal(equity.pnlYen, -2_490, "累積実現に初日の損が入る");
assert.equal(equity.points.find((p) => p.date === "2030-01-07")?.pnlYen, -2_490);

const merged = mergeStockBrokerOrdersWithStatementFills([], "user-test", FIXTURE);
assert.equal(merged.length, FIXTURE.length);
assert.ok(merged.some((o) => o.symbol === "9004" && o.side === "buy"));

// 設定値: 生 JSON / base64 JSON / 不正値
const json = JSON.stringify(FIXTURE);
assert.equal(parseStatementFillsSetting(json).length, FIXTURE.length);
assert.equal(
  parseStatementFillsSetting(Buffer.from(json, "utf8").toString("base64")).length,
  FIXTURE.length,
);
assert.deepEqual(parseStatementFillsSetting(undefined), []);
assert.deepEqual(parseStatementFillsSetting("not-json"), []);
assert.deepEqual(
  parseStatementFillsSetting(JSON.stringify([{ jstAt: "x" }])),
  [],
  "形が違う要素は捨てる",
);

const prev = process.env.STOCK_BROKER_STATEMENT_FILLS_JSON;
delete process.env.STOCK_BROKER_STATEMENT_FILLS_JSON;
assert.deepEqual(loadStatementFills(), [], "未設定なら補完なし");
assert.deepEqual(mergeStockBrokerOrdersWithStatementFills([], "user-test"), []);
process.env.STOCK_BROKER_STATEMENT_FILLS_JSON = json;
assert.equal(loadStatementFills().length, FIXTURE.length);
if (prev === undefined) delete process.env.STOCK_BROKER_STATEMENT_FILLS_JSON;
else process.env.STOCK_BROKER_STATEMENT_FILLS_JSON = prev;

console.log("stock-broker-statement-fills.test.ts: ok");
