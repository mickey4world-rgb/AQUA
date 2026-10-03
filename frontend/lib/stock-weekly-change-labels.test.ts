import assert from "node:assert/strict";
import {
  buildWeeklyChangeItems,
  weeklyActionVerb,
  weeklyChangeBadgeByCode,
} from "./stock-weekly-change-labels";

assert.equal(weeklyActionVerb("create"), "追加（新規登録）");
assert.equal(weeklyActionVerb("deactivate"), "外し（監視メモへ）");

const items = buildWeeklyChangeItems(
  [
    { type: "keep", code: "4689", ok: true },
    { type: "create", code: "3903", ok: true },
    { type: "create", code: "3776", ok: true },
    { type: "deactivate", code: "3778", ok: true },
    { type: "deactivate", code: "9107", ok: true },
  ],
  new Map([
    ["3903", "グリームス"],
    ["3776", "ブロードエンタープライズ"],
    ["3778", "さくらインターネット"],
    ["9107", "川崎汽船"],
  ]),
);

assert.equal(items.length, 4);
assert.deepEqual(
  items.filter((i) => i.side === "add").map((i) => i.code),
  ["3903", "3776"],
);
assert.deepEqual(
  items.filter((i) => i.side === "remove").map((i) => i.code),
  ["3778", "9107"],
);
assert.ok(items[0]!.verb.includes("追加"));
assert.ok(!items.some((i) => i.verb === "create"));

const badges = weeklyChangeBadgeByCode(items);
assert.equal(badges.get("3903"), "今週追加");
assert.equal(badges.get("9107"), "今週メモへ");
assert.equal(badges.get("4689"), undefined);

console.log("stock-weekly-change-labels.test.ts: ok");
