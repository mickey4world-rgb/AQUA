import assert from "node:assert/strict";
import { jpStockCode4, stockChartLinksForCode } from "./stock-chart-links";

assert.equal(jpStockCode4("7203"), "7203");
assert.equal(jpStockCode4("7203.T"), "7203");
assert.equal(jpStockCode4("TSE:6758"), "6758");
assert.equal(jpStockCode4("AAPL"), null);

const links = stockChartLinksForCode("7203");
assert.equal(links.length, 3);
assert.ok(links.some((l) => l.id === "kabutan" && l.href.includes("7203")));
assert.ok(links.some((l) => l.id === "tradingview" && l.href.includes("TSE%3A7203")));
assert.ok(links.some((l) => l.id === "yahoo-jp" && l.href.includes("7203.T")));

assert.deepEqual(stockChartLinksForCode("MSFT"), []);

console.log("stock-chart-links.test.ts: ok");
