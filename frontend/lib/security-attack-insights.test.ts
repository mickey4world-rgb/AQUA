import assert from "node:assert/strict";
import {
  buildAttackInsights,
  classifyAttackTarget,
} from "./security-attack-insights";

assert.equal(classifyAttackTarget("/login"), "auth");
assert.equal(classifyAttackTarget("/api/auth/session"), "auth");
assert.equal(classifyAttackTarget("/api/stocks/cron/tick"), "cron");
assert.equal(classifyAttackTarget("/api/stocks/quote"), "stocks");
assert.equal(classifyAttackTarget("/api/soluna/briefing"), "soluna");
assert.equal(classifyAttackTarget("/api/news-search/digest"), "news");
assert.equal(classifyAttackTarget("/space/viewer"), "space");
assert.equal(classifyAttackTarget("/api/costs/dashboard"), "costs");
assert.equal(classifyAttackTarget("/api/public/demo"), "public_api");
assert.equal(classifyAttackTarget("/about"), "page");

const report = buildAttackInsights([
  { country: "CN", path: "/login", reason: "許可外", count: 5 },
  { country: "CN", path: "/api/auth/x", reason: "拒否", count: 2 },
  { country: "US", path: "/api/stocks/quote", reason: "rate", count: 3 },
  { country: "?", path: "/api/soluna/jobs", reason: "secret", count: 1 },
]);

assert.equal(report.totalEvents, 11);
assert.ok(report.flows.length >= 2);
assert.equal(report.flows[0]!.country, "CN");
assert.equal(report.flows[0]!.targetLabel, "ログイン・認証");
assert.equal(report.flows[0]!.count, 7);
assert.ok(report.byTarget.some((t) => t.targetKind === "stocks" && t.count === 3));
assert.ok(report.narrative.some((n) => n.includes("CN")));
assert.ok(report.byCountry.some((c) => c.country === "不明" && c.count === 1));

const empty = buildAttackInsights([]);
assert.equal(empty.totalEvents, 0);
assert.match(empty.narrative[0]!, /ありません/);

console.log("security-attack-insights.test.ts: ok");
