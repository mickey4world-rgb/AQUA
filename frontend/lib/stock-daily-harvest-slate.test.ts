/**
 * Run: npx --yes tsx lib/stock-daily-harvest-slate.test.ts
 */
import assert from "node:assert/strict";
import {
  planDailyHarvestSlate,
  scoreDailyHarvestCandidate,
} from "./stock-daily-harvest-slate";

{
  const dip = scoreDailyHarvestCandidate({
    code: "4755",
    name: "楽天",
    price: 900,
    changePct: -4,
    avgVolume: 800_000,
    tier: "core",
    heldShares: 0,
    wasOnSlate: false,
  });
  const hot = scoreDailyHarvestCandidate({
    code: "3778",
    name: "さくら",
    price: 2_500,
    changePct: 12,
    avgVolume: 800_000,
    tier: "core",
    heldShares: 0,
    wasOnSlate: false,
  });
  assert.ok(dip.eligible);
  assert.ok(hot.eligible);
  assert.ok(dip.score > hot.score, "押し目が過熱より高スコア");
}

{
  const scores = [
    scoreDailyHarvestCandidate({
      code: "A",
      name: "a",
      price: 800,
      changePct: -3,
      tier: "core",
      heldShares: 0,
      wasOnSlate: true,
      avgVolume: 200_000,
    }),
    scoreDailyHarvestCandidate({
      code: "B",
      name: "b",
      price: 900,
      changePct: -6,
      tier: "core",
      heldShares: 0,
      wasOnSlate: false,
      avgVolume: 200_000,
    }),
    scoreDailyHarvestCandidate({
      code: "C",
      name: "c",
      price: 1_000,
      changePct: 1,
      tier: "satellite",
      heldShares: 100,
      wasOnSlate: true,
      avgVolume: 200_000,
    }),
    scoreDailyHarvestCandidate({
      code: "D",
      name: "d",
      price: 1_100,
      changePct: -2,
      tier: "core-mid",
      heldShares: 0,
      wasOnSlate: false,
      avgVolume: 200_000,
    }),
    ...["E", "F", "G", "H", "I", "J", "K"].map((code, i) =>
      scoreDailyHarvestCandidate({
        code,
        name: code,
        price: 700 + i * 50,
        changePct: -1,
        tier: "satellite",
        heldShares: 0,
        wasOnSlate: true,
        avgVolume: 100_000,
      }),
    ),
  ];

  const plan = planDailyHarvestSlate({
    scores,
    previousCodes: ["A", "C", "E", "F", "G", "H", "I", "J", "K", "X"],
    dayId: "2026-11-23",
    size: 10,
    maxReplacements: 4,
  });

  assert.equal(plan.codes.length, 10);
  assert.ok(plan.codes.includes("C"), "保有は必ず残る");
  assert.ok(plan.added.length <= 4, `入替上限: added=${plan.added.length}`);
  assert.ok(plan.summary.includes("少額売買枠"));
}

{
  // 初回（前日枠なし）でも10件埋まる
  const scores = Array.from({ length: 15 }, (_, i) =>
    scoreDailyHarvestCandidate({
      code: `S${i}`,
      name: `s${i}`,
      price: 800 + i * 10,
      changePct: -2,
      tier: "core",
      heldShares: 0,
      wasOnSlate: false,
      avgVolume: 300_000,
    }),
  );
  const plan = planDailyHarvestSlate({
    scores,
    previousCodes: [],
    dayId: "2026-11-23",
    size: 10,
    maxReplacements: 4,
  });
  assert.equal(plan.codes.length, 10);
  assert.equal(plan.kept.length, 0);
  assert.equal(plan.added.length, 10);
}

console.log("stock-daily-harvest-slate.test.ts: ok");
