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

assert.equal(STOCK_DIP_BUY_SHARE_OF_WATCHES, 0.65);
assert.equal(maxDipBuysForWatchCount(4), 2);
assert.equal(maxDipBuysForWatchCount(3), 1);
assert.equal(maxDipBuysForWatchCount(6), 3);
assert.equal(maxDipBuysForWatchCount(1), 0); // 1銘柄だけでは安値枠0→従来#8のみ
assert.equal(maxDipBuysForWatchCount(0), 0);
// 候補が多い日は 75% 枠
assert.equal(maxDipBuysForWatchCount(4, 2), 3);
assert.equal(maxDipBuysForWatchCount(4, 3), 3);

assert.ok(STOCK_TRADE_RULES.some((r) => r.id === 44));
assert.ok(STOCK_TRADE_RULES.some((r) => r.id === 46));
assert.ok(
  STOCK_TRADE_RULES.find((r) => r.id === 44)?.summary.includes("約 65%"),
);
assert.ok(
  STOCK_TRADE_RULES.find((r) => r.id === 44)?.summary.includes("約 75%"),
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
  const eligible = rows.filter(
    (r) => !r.alreadyBought && r.dipBuyEligible && r.dipScore > 0,
  );
  const cap = maxDipBuysForWatchCount(watchCount, eligible.length);
  return eligible
    .sort((a, b) => b.dipScore - a.dipScore)
    .slice(0, cap)
    .map((r) => r.symbol);
}

// 4銘柄全員候補 → 混み日で枠75%=3（通常50%なら2）
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
  assert.equal(picked.length, maxDipBuysForWatchCount(watches, 4));
  assert.deepEqual(picked, ["4755", "9107", "4689"]);
}

// 6銘柄全員候補 → 混み日 floor(6*0.75)=4
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
  assert.equal(picked.length, 4);
  assert.deepEqual(picked, ["A", "B", "C", "D"]);
}

// #8で買った銘柄は安値枠から除外（母数はウォッチ数、候補数で混み判定）
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
  // 未買候補3/4 → 混み日枠3
  assert.deepEqual(picked, ["4755", "9107", "1963"]);
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
  // Path A で買った扱い: action=buy（強気 or #8部分解禁）
  const pathABought = rows.filter((r) => r.action === "buy");
  const dipEligible = rows.filter((r) => r.dipBuyEligible);
  const dipSlotCap = maxDipBuysForWatchCount(watchCount, dipEligible.length);
  const dipPicked = selectDipBuySymbols(
    rows.map((r) => ({
      symbol: r.code,
      dipBuyEligible: !!r.dipBuyEligible,
      dipScore: r.dipScore ?? 0,
      alreadyBought: pathABought.some((t) => t.code === r.code),
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
        rows,
        pathABuyCount: pathABought.length,
        dipEligibleCount: dipEligible.length,
        dipPicked,
      },
      null,
      2,
    ),
  );

  // 不変条件: 安値採用 ≤ 枠（混み日拡大後）
  assert.ok(dipPicked.length <= dipSlotCap);
}

liveSim()
  .then(() => {
    console.log("stock-dip-buy.test.ts: ok");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
