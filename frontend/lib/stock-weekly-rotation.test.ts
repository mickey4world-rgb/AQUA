import assert from "node:assert/strict";
import {
  isJpLotAffordable,
  jpLotYen,
  jpTpYenAtHardTarget,
  jstWeekId,
  planWeeklyRotation,
  scoreTakeProfitEase,
} from "../lib/stock-weekly-rotation";

// 単元コスト
assert.equal(jpLotYen(1500), 150_000);
assert.ok(isJpLotAffordable(1500));
assert.ok(!isJpLotAffordable(6000)); // 60万 > 50万枠
assert.equal(jpTpYenAtHardTarget(1500), 30_000); // 15万 * 0.2

// 買える銘柄の方がスコア高い
{
  const cheap = scoreTakeProfitEase({
    code: "4689",
    name: "LINEヤフー",
    price: 500,
    changePct: 0,
    tier: "core",
    heldShares: 0,
    currentlyActive: false,
  });
  const rich = scoreTakeProfitEase({
    code: "6920",
    name: "レーザーテック",
    price: 45000,
    changePct: 0,
    tier: "watch-only",
    heldShares: 0,
    currentlyActive: false,
  });
  assert.ok(cheap.affordable);
  assert.ok(!rich.affordable);
  assert.ok(cheap.score > rich.score, `cheap ${cheap.score} vs rich ${rich.score}`);
}

// 保有はローテアウトされない
{
  const scores = [
    scoreTakeProfitEase({
      code: "AAAA",
      name: "弱気",
      price: 2000,
      changePct: 10,
      tier: "thin",
      heldShares: 100,
      currentlyActive: true,
    }),
    scoreTakeProfitEase({
      code: "BBBB",
      name: "強気",
      price: 800,
      changePct: -2,
      tier: "core",
      heldShares: 0,
      currentlyActive: false,
    }),
    scoreTakeProfitEase({
      code: "CCCC",
      name: "単元不可",
      price: 9000,
      changePct: 0,
      tier: "watch-only",
      heldShares: 0,
      currentlyActive: true,
    }),
  ];
  const plan = planWeeklyRotation({
    scores,
    existingCodes: new Set(["AAAA", "CCCC"]),
    targetActive: 2,
    maxRotations: 3,
    weekId: "2026-10-03",
  });
  assert.ok(plan.desiredActiveCodes.includes("AAAA"), "held must stay desired");
  assert.ok(
    !plan.actions.some((a) => a.code === "AAAA" && a.type === "deactivate"),
    "held must not deactivate",
  );
  assert.ok(
    plan.actions.some((a) => a.code === "CCCC" && a.type === "deactivate"),
    "unaffordable active must deactivate",
  );
  assert.ok(
    plan.actions.some(
      (a) => a.code === "BBBB" && (a.type === "create" || a.type === "activate"),
    ),
    "strong affordable should be raised",
  );
}

// 空ユニバース → 上位が create（自動シード）
{
  const scores = [
    scoreTakeProfitEase({
      code: "1111",
      name: "A",
      price: 1000,
      changePct: 0,
      tier: "core",
      heldShares: 0,
      currentlyActive: false,
    }),
    scoreTakeProfitEase({
      code: "2222",
      name: "B",
      price: 1200,
      changePct: 1,
      tier: "core",
      heldShares: 0,
      currentlyActive: false,
    }),
    scoreTakeProfitEase({
      code: "9999",
      name: "expensive",
      price: 8000,
      changePct: 0,
      tier: "watch-only",
      heldShares: 0,
      currentlyActive: false,
    }),
  ];
  const plan = planWeeklyRotation({
    scores,
    existingCodes: new Set(),
    targetActive: 2,
    weekId: "2026-10-03",
  });
  const creates = plan.actions.filter((a) => a.type === "create");
  assert.equal(creates.length, 2);
  assert.ok(plan.actions.some((a) => a.code === "9999" && a.type === "park"));
}

// 週キーは JST 土曜
{
  // 2026-10-01 は木曜 JST → 土曜は 10-03
  const id = jstWeekId(new Date("2026-10-01T12:00:00+09:00"));
  assert.equal(id, "2026-10-03");
}

console.log("stock-weekly-rotation.test.ts: ok");
