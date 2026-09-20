import assert from "node:assert/strict";
import { buildEquityPerformance, appendEquitySnapshot } from "./soluna-equity-performance";
import type { SolunaAssetLedger, SolunaTradeRecord } from "./types/soluna";
import { ASSET_PRINCIPAL_YEN } from "./soluna-asset-trade-constants";

function sampleTrade(
  partial: Partial<SolunaTradeRecord> & Pick<SolunaTradeRecord, "id" | "createdAt" | "side">,
): SolunaTradeRecord {
  return {
    product: "BTC_JPY",
    sizeJpy: 5_000,
    priceBtc: 10_000_000,
    reason: "dca",
    briefingId: "b1",
    ...partial,
  };
}

{
  const perf = buildEquityPerformance({
    principalYen: ASSET_PRINCIPAL_YEN,
    totalYen: 103_500,
    cashYen: 72_000,
    monthlyTargetYen: 2_000,
    lastMonthTotalYen: 100_000,
    monthlyRealizedPnlYen: 1_200,
    monthlySummaries: [
      {
        month: "2026-08",
        openingBalanceYen: 100_000,
        targetProfitYen: 2_000,
        realizedPnlYen: 800,
        goalReached: false,
      },
      {
        month: "2026-09",
        openingBalanceYen: 101_000,
        targetProfitYen: 2_020,
        realizedPnlYen: 400,
        goalReached: false,
      },
    ],
    trades: [
      sampleTrade({
        id: "t1",
        createdAt: "2026-08-10T01:00:00.000Z",
        side: "BUY",
        sizeJpy: 8_000,
      }),
      sampleTrade({
        id: "t2",
        createdAt: "2026-08-20T01:00:00.000Z",
        side: "SELL",
        sizeJpy: 8_500,
        realizedPnlJpy: 500,
        reason: "take-profit",
      }),
    ],
    now: new Date("2026-09-16T03:00:00.000Z"),
  });

  assert.equal(perf.startDate, "2026-08-01");
  assert.equal(perf.pnlYen, 3_500);
  assert.ok(perf.points.length >= 3, "should have seed + months/trades + live");
  assert.equal(perf.points[0]?.totalYen, 100_000);
  assert.equal(perf.points[perf.points.length - 1]?.totalYen, 103_500);
  assert.equal(perf.markers.length, 2);
  assert.ok(perf.weeklyPoints.length >= 1);
  assert.equal(perf.monthGoalTotalYen, 102_000);
}

{
  const ledger = {
    principalYen: ASSET_PRINCIPAL_YEN,
    lastMonthTotalYen: ASSET_PRINCIPAL_YEN,
    monthlyTargetYen: 2_000,
    totalYen: 101_000,
    cashYen: 90_000,
    updatedAt: "2026-09-16T05:00:00.000Z",
    equitySnapshots: [],
  } as unknown as SolunaAssetLedger;

  const withSnap = appendEquitySnapshot(ledger, [
    sampleTrade({
      id: "t3",
      createdAt: "2026-09-16T05:00:00.000Z",
      side: "BUY",
      sizeJpy: 3_000,
    }),
  ]);
  assert.equal(withSnap.equitySnapshots?.length, 1);
  assert.equal(withSnap.equitySnapshots?.[0]?.date, "2026-09-16");
  assert.equal(withSnap.equitySnapshots?.[0]?.buyYen, 3_000);
  assert.equal(withSnap.equitySnapshots?.[0]?.pnlYen, 1_000);

  const sameDay = appendEquitySnapshot(
    { ...withSnap, totalYen: 102_000, updatedAt: "2026-09-16T08:00:00.000Z" },
    [
      sampleTrade({
        id: "t4",
        createdAt: "2026-09-16T08:00:00.000Z",
        side: "SELL",
        sizeJpy: 4_000,
        realizedPnlJpy: 200,
      }),
    ],
  );
  assert.equal(sameDay.equitySnapshots?.length, 1, "same JST day merges");
  assert.equal(sameDay.equitySnapshots?.[0]?.buyYen, 3_000);
  assert.equal(sameDay.equitySnapshots?.[0]?.sellYen, 4_000);
  assert.equal(sameDay.equitySnapshots?.[0]?.tradeCount, 2);
}

console.log("soluna-equity-performance: ok");
