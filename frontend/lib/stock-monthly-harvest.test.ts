/**
 * Run: npx --yes tsx lib/stock-monthly-harvest.test.ts
 */
import assert from "node:assert/strict";
import {
  ensureMonthlyHarvestInActiveCodes,
  evaluateMonthlyHarvestStatus,
  isMonthlyHarvestCandidate,
  shouldMonthlyHarvestSell,
  yenAtOnePercentMove,
} from "./stock-monthly-harvest";
import { decideStockSellIntent } from "./stock-sell-policy";
import { planWeeklyRotation, scoreTakeProfitEase } from "./stock-weekly-rotation";
import type { StockBrokerOrderRecord } from "./types/stock-broker-trade";

{
  // 楽天クラス（〜千円）は月次エンジン向き、超高額は向きにくい
  assert.equal(isMonthlyHarvestCandidate(900), true);
  assert.equal(isMonthlyHarvestCandidate(1_200), true);
  assert.ok(yenAtOnePercentMove(1_000) === 1_000);
  // 単元不可の超高値
  assert.equal(isMonthlyHarvestCandidate(80_000), false);
}

{
  const mid = new Date("2026-11-10T03:00:00Z"); // JST 11/10
  const status = evaluateMonthlyHarvestStatus({
    orders: [],
    now: mid,
  });
  assert.equal(status.needed, true);
  assert.equal(status.realizedSellProfitYen, 0);
  assert.ok(status.targetYen > 0);

  assert.equal(
    shouldMonthlyHarvestSell({
      changeRate: 0.01,
      isHarvestCandidate: true,
      status,
    }),
    true,
  );
  assert.equal(
    shouldMonthlyHarvestSell({
      changeRate: 0.01,
      isHarvestCandidate: false,
      status: { needed: true, urgent: false },
    }),
    false,
  );
  assert.equal(
    shouldMonthlyHarvestSell({
      changeRate: 0.01,
      isHarvestCandidate: false,
      status: { needed: true, urgent: true },
    }),
    true,
  );
  assert.equal(
    shouldMonthlyHarvestSell({
      changeRate: 0.001,
      isHarvestCandidate: true,
      status: { needed: true, urgent: true },
    }),
    false,
    "手数料負けする微プラスは売らない",
  );
}

{
  const sell = decideStockSellIntent({
    symbol: "4755",
    buyPrice: 1000,
    currentPrice: 1010,
    adviceAction: "hold",
    targetPrice: 2000,
    preferEarlierTakeProfit: false,
    orders: [],
    monthlyHarvest: { needed: true, urgent: false, isCandidate: true },
  });
  assert.ok(sell);
  assert.equal(sell!.kind, "take-profit");
  assert.ok(sell!.reason.includes("月次少額刈り取り"));
  assert.ok(sell!.ruleIds.includes(50));
}

{
  // 赤字は月次でも売らない
  const no = decideStockSellIntent({
    symbol: "4755",
    buyPrice: 1000,
    currentPrice: 970,
    adviceAction: "sell",
    targetPrice: 1200,
    preferEarlierTakeProfit: true,
    orders: [
      {
        id: "o1",
        userId: "u",
        side: "buy",
        symbol: "4755",
        qty: 100,
        status: "submitted",
        createdAt: new Date().toISOString(),
      } as StockBrokerOrderRecord,
    ],
    monthlyHarvest: { needed: true, urgent: true, isCandidate: true },
  });
  assert.equal(no, null);
}

{
  const ensured = ensureMonthlyHarvestInActiveCodes({
    desiredActiveCodes: ["6920"],
    candidates: [
      { code: "6920", price: 40_000, score: 90 },
      { code: "4755", price: 900, score: 40 },
      { code: "3778", price: 2_500, score: 50 },
    ],
    targetActive: 2,
  });
  assert.ok(ensured.injectedCode === "3778" || ensured.injectedCode === "4755");
  assert.ok(
    ensured.codes.some((c) => c === "4755" || c === "3778"),
    "少額利確エンジンが1つ入る",
  );
}

{
  const scores = [
    scoreTakeProfitEase({
      code: "6920",
      name: "高額",
      price: 45_000,
      changePct: 0,
      tier: "watch-only",
      heldShares: 0,
      currentlyActive: true,
    }),
    scoreTakeProfitEase({
      code: "4755",
      name: "楽天",
      price: 950,
      changePct: -2,
      tier: "core",
      heldShares: 0,
      currentlyActive: false,
    }),
  ];
  const plan = planWeeklyRotation({
    scores,
    existingCodes: new Set(["6920", "4755"]),
    targetActive: 1,
    maxRotations: 3,
  });
  assert.ok(
    plan.desiredActiveCodes.includes("4755"),
    `月次エンジンが desired に入る: ${plan.desiredActiveCodes.join(",")}`,
  );
}

console.log("stock-monthly-harvest.test.ts: ok");
