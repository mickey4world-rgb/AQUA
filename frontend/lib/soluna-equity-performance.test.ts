/**
 * 実現損益ベースの折れ線オラクル
 * Run: npx --yes tsx lib/soluna-equity-performance.test.ts
 */
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
  // 依頼ストーリー: 8月損切でマイナス → 今月取り戻して元本超え。買いの時価は線に出ない。
  const perf = buildEquityPerformance({
    principalYen: ASSET_PRINCIPAL_YEN,
    totalYen: 180_000, // 時価は高くても折れ線には使わない
    cashYen: 72_000,
    monthlyTargetYen: 2_000,
    lastMonthTotalYen: 94_000,
    monthlyRealizedPnlYen: 7_500,
    monthlySummaries: [
      {
        month: "2026-08",
        openingBalanceYen: 100_000,
        targetProfitYen: 2_000,
        realizedPnlYen: -6_000,
        goalReached: false,
      },
    ],
    trades: [
      sampleTrade({
        id: "t-buy",
        createdAt: "2026-09-05T01:00:00.000Z",
        side: "BUY",
        sizeJpy: 10_000,
      }),
      sampleTrade({
        id: "t-sell-1",
        createdAt: "2026-09-10T01:00:00.000Z",
        side: "SELL",
        sizeJpy: 12_000,
        realizedPnlJpy: 4_000,
        reason: "take-profit",
      }),
      sampleTrade({
        id: "t-sell-2",
        createdAt: "2026-09-16T01:00:00.000Z",
        side: "SELL",
        sizeJpy: 9_000,
        realizedPnlJpy: 3_500,
        reason: "take-profit",
      }),
    ],
    now: new Date("2026-09-16T03:00:00.000Z"),
  });

  assert.equal(perf.startDate, "2026-08-01");
  // 累積実現 = Aug(-6000) + Sep(4000+3500) = +1500 → 実現ベース 101500
  assert.equal(perf.pnlYen, 1_500);
  assert.equal(perf.currentTotalYen, 101_500);
  // 時価 180000 を線の終点に使っていない
  assert.notEqual(perf.points[perf.points.length - 1]?.totalYen, 180_000);

  const augEnd = perf.points.find((p) => p.date === "2026-08-31");
  assert.ok(augEnd, "August month-end anchor");
  assert.equal(augEnd!.totalYen, 94_000);
  assert.equal(augEnd!.pnlYen, -6_000);

  const afterBuy = perf.points.find((p) => p.date === "2026-09-05");
  // 買いは線を動かさない（8月末と同じ実現ベース）
  if (afterBuy) {
    assert.equal(afterBuy.totalYen, 94_000);
  }

  const afterFirstSell = perf.points.find((p) => p.date === "2026-09-10");
  assert.ok(afterFirstSell);
  assert.equal(afterFirstSell!.totalYen, 98_000);

  const live = perf.points[perf.points.length - 1];
  assert.equal(live?.totalYen, 101_500);
  assert.ok(live!.totalYen > ASSET_PRINCIPAL_YEN, "now slightly above principal");
  assert.equal(perf.markers.length, 3);
}

{
  const ledger = {
    principalYen: ASSET_PRINCIPAL_YEN,
    lastMonthTotalYen: ASSET_PRINCIPAL_YEN,
    monthlyTargetYen: 2_000,
    totalYen: 180_000,
    cashYen: 90_000,
    updatedAt: "2026-09-16T05:00:00.000Z",
    equitySnapshots: [],
    trades: [
      sampleTrade({
        id: "t3",
        createdAt: "2026-09-16T05:00:00.000Z",
        side: "SELL",
        sizeJpy: 4_000,
        realizedPnlJpy: 1_000,
      }),
    ],
  } as unknown as SolunaAssetLedger;

  const withSnap = appendEquitySnapshot(ledger, []);
  assert.equal(withSnap.equitySnapshots?.length, 1);
  assert.equal(withSnap.equitySnapshots?.[0]?.date, "2026-09-16");
  assert.equal(withSnap.equitySnapshots?.[0]?.pnlYen, 1_000);
  assert.equal(withSnap.equitySnapshots?.[0]?.totalYen, 101_000);
  // 時価をスナップしない
  assert.notEqual(withSnap.equitySnapshots?.[0]?.totalYen, 180_000);
}

console.log("soluna-equity-performance: ok");
