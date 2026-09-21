/**
 * bitFlyer 最小ロット／円建て換算のオラクル（全銘柄）
 * Run: npx --yes tsx lib/soluna-asset-order-size.test.ts
 */
import assert from "node:assert/strict";
import {
  minOrderNotionalYen,
  sizeFromYenAmount,
  sizeFromHeld,
  resolveBuyAmountJpy,
} from "./server/soluna-asset-trade";

{
  // BTC: Lightning Spot 最小 0.001（旧アプリ値 0.0001 は拒否される）
  const price = 16_000_000;
  assert.equal(minOrderNotionalYen("BTC_JPY", price), 16_000);
  assert.equal(sizeFromYenAmount("BTC_JPY", 5_000, price), null);
  assert.equal(sizeFromYenAmount("BTC_JPY", 16_000, price), 0.001);
  assert.equal(sizeFromYenAmount("BTC_JPY", 15_999, price), null);
  assert.equal(sizeFromHeld("BTC_JPY", 0.0009), null);
  assert.equal(sizeFromHeld("BTC_JPY", 0.0015), 0.001);
}

{
  // 予算不足 → 買い金額は null（切り上げ発注禁止）
  const amount = resolveBuyAmountJpy({
    product: "BTC_JPY",
    priceYen: 16_000_000,
    roomYen: 8_000,
    remainingDailyYen: 30_000,
    conviction: 1,
  });
  assert.equal(amount, null);
}

{
  // room が分散枠で 1 万円超えていれば、最小ロット（1.6 万円）まで許可
  const amount = resolveBuyAmountJpy({
    product: "BTC_JPY",
    priceYen: 16_000_000,
    roomYen: 50_000,
    remainingDailyYen: 50_000,
    conviction: 1,
  });
  assert.equal(amount, 16_000);
  assert.equal(sizeFromYenAmount("BTC_JPY", amount!, 16_000_000), 0.001);
}

{
  // ETH: Spot 最小 0.01
  const price = 500_000;
  assert.equal(minOrderNotionalYen("ETH_JPY", price), 5_000);
  assert.equal(sizeFromYenAmount("ETH_JPY", 4_000, price), null);
  assert.equal(sizeFromYenAmount("ETH_JPY", 10_000, price), 0.02);
  const amount = resolveBuyAmountJpy({
    product: "ETH_JPY",
    priceYen: price,
    roomYen: 50_000,
    remainingDailyYen: 50_000,
    conviction: 1,
  });
  assert.equal(amount, 10_000);
}

{
  // XRP / XLM: Spot 最小 0.1（旧アプリ値 1.0 は売却・少額買いで過剰拒否）
  assert.equal(sizeFromYenAmount("XRP_JPY", 50, 400), 0.1);
  assert.equal(sizeFromYenAmount("XRP_JPY", 30, 400), null);
  assert.equal(sizeFromHeld("XRP_JPY", 0.15), 0.1);
  assert.equal(sizeFromHeld("XLM_JPY", 0.09), null);
  assert.equal(sizeFromHeld("XLM_JPY", 1.25), 1.2);
}

console.log("soluna-asset-order-size.test.ts: ok");
