/**
 * Run: npx --yes tsx lib/soluna-avg-buy-price.test.ts
 */
import assert from "node:assert/strict";
import {
  averageBuyPriceYenFromTrades,
  resolveAvgBuyPriceYen,
} from "./soluna-avg-buy-price";

{
  const avg = averageBuyPriceYenFromTrades(
    [
      { side: "BUY", product: "BTC_JPY", sizeJpy: 10_000, priceBtc: 10_000_000 },
      { side: "BUY", product: "ETH_JPY", sizeJpy: 5_000, priceBtc: 500_000 },
    ],
    "BTC_JPY",
  );
  assert.equal(avg, 10_000_000);
}

{
  // 旧データ: product 無しの買いは BTC
  const avg = averageBuyPriceYenFromTrades(
    [{ side: "BUY", product: undefined as unknown as "BTC_JPY", sizeJpy: 8_000, priceBtc: 9_000_000 }],
    "BTC_JPY",
  );
  assert.equal(avg, 9_000_000);
}

{
  // 保有だけ・買い履歴なし → 現在値フォールバック（BTC 入金ケース）
  const resolved = resolveAvgBuyPriceYen({
    trades: [{ side: "BUY", product: "ETH_JPY", sizeJpy: 5_000, priceBtc: 400_000 }],
    product: "BTC_JPY",
    held: 0.001,
    markPriceYen: 15_000_000,
  });
  assert.equal(resolved.avgBuyEstimated, true);
  assert.equal(resolved.avgBuyPriceYen, 15_000_000);
}

{
  const resolved = resolveAvgBuyPriceYen({
    trades: [{ side: "BUY", product: "BTC_JPY", sizeJpy: 10_000, priceBtc: 12_000_000 }],
    product: "BTC_JPY",
    held: 0.001,
    markPriceYen: 15_000_000,
  });
  assert.equal(resolved.avgBuyEstimated, false);
  assert.equal(resolved.avgBuyPriceYen, 12_000_000);
}

console.log("soluna-avg-buy-price.test.ts: ok");
