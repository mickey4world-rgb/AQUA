/**
 * Run: npx --yes tsx lib/gyosei-life-proximity.test.ts
 */
import assert from "node:assert/strict";
import {
  addressMatchesPlace,
  buildLifeProximityFromFlows,
  normalizePrefectureInput,
  payeeNameMatchesPlace,
} from "./gyosei-life-proximity";

assert.equal(normalizePrefectureInput("東京"), "東京都");
assert.equal(normalizePrefectureInput("大阪府"), "大阪府");
assert.equal(normalizePrefectureInput("火星"), null);

assert.equal(
  addressMatchesPlace("東京都千代田区霞が関１丁目", "東京都", null),
  true,
);
assert.equal(
  addressMatchesPlace("大阪府大阪市北区", "東京都", null),
  false,
);
assert.equal(
  addressMatchesPlace("神奈川県横浜市中区", "神奈川県", "横浜市"),
  true,
);
assert.equal(
  addressMatchesPlace("神奈川県川崎市", "神奈川県", "横浜市"),
  false,
);

assert.equal(payeeNameMatchesPlace("沖縄県", "沖縄県", null), true);
assert.equal(payeeNameMatchesPlace("丸紅株式会社", "東京都", null), false);
assert.equal(payeeNameMatchesPlace("横浜市", "神奈川県", "横浜市"), true);

const result = buildLifeProximityFromFlows(
  [
    {
      payee: "サンプル市",
      project: "防災サンプル事業",
      ministry: "内閣府",
      amount: 100,
      address: null,
    },
    {
      payee: "フィクション商事",
      project: "防災サンプル事業",
      ministry: "内閣府",
      amount: 50,
      address: "サンプル県サンプル市中央１丁目",
    },
    {
      payee: "別県商事",
      project: "無関係",
      ministry: "防衛省",
      amount: 999,
      address: "東京都千代田区",
    },
  ],
  { prefecture: "サンプル県", city: "サンプル市" },
  { year: 2025, unit: "百万円", sourceLabel: "test" },
);

assert.equal(result.payees.length, 2);
assert.ok(result.payees.some((p) => p.payee === "サンプル市"));
assert.ok(result.payees.some((p) => p.payee === "フィクション商事"));
assert.ok(!result.payees.some((p) => p.payee === "別県商事"));
assert.equal(result.totals.amount, 150);
assert.equal(result.emptyReason, null);

const empty = buildLifeProximityFromFlows(
  [{ payee: "X", project: "Y", ministry: "Z", amount: 1, address: "東京都" }],
  { prefecture: "沖縄県", city: null },
  { year: 2025, unit: "百万円", sourceLabel: "test" },
);
assert.ok(empty.emptyReason);

console.log("gyosei-life-proximity.test.ts: ok");
