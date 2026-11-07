import assert from "node:assert/strict";
import {
  atr,
  atrExpansionRatio,
  bollinger,
  bollingerBreakout,
  emaCross,
  emaLast,
  isPerfectOrderBull,
  macd,
  maDeviationPct,
  rsi,
  sma,
  volumeSpikeRatio,
} from "../lib/stock-technicals";

// 単調上昇 → RSI 高め
{
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const r = rsi(up, 14);
  assert.ok(r > 60, `expected elevated RSI, got ${r}`);
}

// SMA
assert.equal(sma([1, 2, 3, 4, 5], 5), 3);

// 乖離
assert.ok(Math.abs(maDeviationPct(110, 100) - 10) < 1e-9);

// BB width positive
{
  const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
  const bb = bollinger(closes, 20, 2);
  assert.ok(bb.widthPct > 0);
}

// MACD on flat → none cross typically
{
  const flat = Array.from({ length: 60 }, () => 100);
  const m = macd(flat);
  assert.equal(m.cross, "none");
}

// volume spike
{
  const vols = [100, 100, 100, 100, 100, 400];
  assert.ok(volumeSpikeRatio(vols, 5) >= 3.9);
}

// EMA は SMA より直近に寄る（上昇系列）
{
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  const e5 = emaLast(up, 5);
  const s5 = sma(up, 5);
  assert.ok(e5 > s5, `EMA5 ${e5} should exceed SMA5 ${s5} on uptrend`);
}

// 強い上昇 → パーフェクトオーダー
{
  const up = Array.from({ length: 90 }, (_, i) => 100 + i * 0.8);
  assert.equal(isPerfectOrderBull(up), true);
  assert.ok(emaCross(up, 5, 25) === "golden" || emaLast(up, 5) > emaLast(up, 25));
}

// ATR > 0 on noisy series
{
  const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 3);
  const highs = closes.map((c, i) => c + 1 + (i % 3) * 0.2);
  const lows = closes.map((c, i) => c - 1 - (i % 2) * 0.2);
  assert.ok(atr(highs, lows, closes, 14) > 0);
  assert.ok(atrExpansionRatio(highs, lows, closes, 14) > 0);
}

// BB breakout helper returns regime
{
  const flat = Array.from({ length: 50 }, () => 100);
  const boom = [
    ...flat,
    ...Array.from({ length: 10 }, (_, i) => 100 + i * 4),
  ];
  const br = bollingerBreakout(boom);
  assert.ok(["squeeze", "expansion", "normal"].includes(br.regime));
}

console.log("stock-technicals.test.ts: ok");
