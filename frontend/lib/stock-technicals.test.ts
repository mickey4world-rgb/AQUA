import assert from "node:assert/strict";
import {
  bollinger,
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

console.log("stock-technicals.test.ts: ok");
