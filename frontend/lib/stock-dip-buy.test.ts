/**
 * 安値ゾーン買い(#44): 固定件数ではなく割合バランス。
 * 依頼: 全員買わない / 一部は従来#8のみで判断 / 数はウォッチ数に対する割合で決める。
 */
import assert from "node:assert/strict";
import {
  STOCK_DIP_BUY_SHARE_OF_WATCHES,
  STOCK_DIP_MAX_RSI,
  maxDipBuysForWatchCount,
} from "./stock-trade-constants";
import { STOCK_TRADE_RULES } from "./stock-trade-rules";
import { analyzeStock } from "./server/stock-analysis";
import type { StockWatch } from "./types/stock";

assert.equal(STOCK_DIP_BUY_SHARE_OF_WATCHES, 0.5);
assert.equal(maxDipBuysForWatchCount(4), 2);
assert.equal(maxDipBuysForWatchCount(3), 1);
assert.equal(maxDipBuysForWatchCount(6), 3);
assert.equal(maxDipBuysForWatchCount(1), 0); // 1銘柄だけでは安値枠0→従来#8のみ
assert.equal(maxDipBuysForWatchCount(0), 0);

assert.ok(STOCK_TRADE_RULES.some((r) => r.id === 44));
assert.ok(
  STOCK_TRADE_RULES.find((r) => r.id === 44)?.summary.includes("約 50%"),
);
assert.ok(
  !STOCK_TRADE_RULES.find((r) => r.id === 44)?.summary.includes("最大 2 銘柄"),
);

type DipRow = {
  symbol: string;
  dipBuyEligible: boolean;
  dipScore: number;
  alreadyBought: boolean;
};

function selectDipBuySymbols(rows: DipRow[], watchCount: number): string[] {
  const cap = maxDipBuysForWatchCount(watchCount);
  return rows
    .filter(
      (r) => !r.alreadyBought && r.dipBuyEligible && r.dipScore > 0,
    )
    .sort((a, b) => b.dipScore - a.dipScore)
    .slice(0, cap)
    .map((r) => r.symbol);
}

// 4銘柄全員候補 → 安値枠は半数(2)、残り2は#8のみ（安値では買わない）
{
  const watches = 4;
  const picked = selectDipBuySymbols(
    [
      { symbol: "4689", dipBuyEligible: true, dipScore: 40, alreadyBought: false },
      { symbol: "4755", dipBuyEligible: true, dipScore: 70, alreadyBought: false },
      { symbol: "9107", dipBuyEligible: true, dipScore: 55, alreadyBought: false },
      { symbol: "1963", dipBuyEligible: true, dipScore: 30, alreadyBought: false },
    ],
    watches,
  );
  assert.equal(picked.length, maxDipBuysForWatchCount(watches));
  assert.deepEqual(picked, ["4755", "9107"]);
  assert.equal(watches - picked.length, 2); // 従来条件側に残る枠
}

// 6銘柄なら安値枠3（固定2ではない）
{
  const watches = 6;
  const picked = selectDipBuySymbols(
    [
      { symbol: "A", dipBuyEligible: true, dipScore: 90, alreadyBought: false },
      { symbol: "B", dipBuyEligible: true, dipScore: 80, alreadyBought: false },
      { symbol: "C", dipBuyEligible: true, dipScore: 70, alreadyBought: false },
      { symbol: "D", dipBuyEligible: true, dipScore: 60, alreadyBought: false },
      { symbol: "E", dipBuyEligible: true, dipScore: 50, alreadyBought: false },
      { symbol: "F", dipBuyEligible: true, dipScore: 40, alreadyBought: false },
    ],
    watches,
  );
  assert.equal(picked.length, 3);
  assert.deepEqual(picked, ["A", "B", "C"]);
}

// #8で買った銘柄は安値枠から除外（枠の計算母数は当日ウォッチ数のまま）
{
  const picked = selectDipBuySymbols(
    [
      { symbol: "4689", dipBuyEligible: true, dipScore: 90, alreadyBought: true },
      { symbol: "4755", dipBuyEligible: true, dipScore: 70, alreadyBought: false },
      { symbol: "9107", dipBuyEligible: true, dipScore: 55, alreadyBought: false },
      { symbol: "1963", dipBuyEligible: true, dipScore: 30, alreadyBought: false },
    ],
    4,
  );
  assert.deepEqual(picked, ["4755", "9107"]);
  assert.ok(!picked.includes("4689"));
}

function mockWatch(code: string): StockWatch {
  const now = new Date().toISOString();
  return {
    id: `sim-${code}`,
    userId: "sim",
    ticker: `${code}.T`,
    market: "jp",
    buyPrice: 1000,
    shares: 0,
    targetMultiplier: 1.2,
    targetPrice: 1200,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

const codes = ["4689", "4755", "9107", "1963"] as const;

async function liveSim() {
  const rows: Array<{
    code: string;
    action: string;
    trend: string;
    rsi14: number;
    nearWeekLow?: boolean;
    nearMonthLow?: boolean;
    dipBuyEligible?: boolean;
    dipScore?: number;
  }> = [];

  for (const code of codes) {
    const advice = await analyzeStock(mockWatch(code));
    rows.push({
      code,
      action: advice.action,
      trend: advice.trend,
      rsi14: advice.rsi14,
      nearWeekLow: advice.nearWeekLow,
      nearMonthLow: advice.nearMonthLow,
      dipBuyEligible: advice.dipBuyEligible,
      dipScore: advice.dipScore,
    });
  }

  const watchCount = rows.length;
  const dipSlotCap = maxDipBuysForWatchCount(watchCount);
  const legacyReserved = watchCount - dipSlotCap;
  const trendBuys = rows.filter((r) => r.action === "buy" && r.trend === "bullish");
  const dipEligible = rows.filter((r) => r.dipBuyEligible);
  const dipPicked = selectDipBuySymbols(
    rows.map((r) => ({
      symbol: r.code,
      dipBuyEligible: !!r.dipBuyEligible,
      dipScore: r.dipScore ?? 0,
      alreadyBought: trendBuys.some((t) => t.code === r.code),
    })),
    watchCount,
  );

  console.log(
    JSON.stringify(
      {
        rsiCap: STOCK_DIP_MAX_RSI,
        share: STOCK_DIP_BUY_SHARE_OF_WATCHES,
        watchCount,
        dipSlotCap,
        legacyReserved,
        rows,
        trendBuyCount: trendBuys.length,
        dipEligibleCount: dipEligible.length,
        dipPicked,
      },
      null,
      2,
    ),
  );

  // 不変条件: 安値採用 ≤ 割合枠。従来側に残る枠が消えない。
  assert.ok(dipPicked.length <= dipSlotCap);
  assert.ok(legacyReserved >= Math.floor(watchCount * (1 - STOCK_DIP_BUY_SHARE_OF_WATCHES)));
  if (dipEligible.length >= dipSlotCap && trendBuys.length === 0) {
    assert.equal(dipPicked.length, dipSlotCap);
  }
}

liveSim()
  .then(() => {
    console.log("stock-dip-buy.test.ts: ok");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
