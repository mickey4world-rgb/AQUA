import assert from "node:assert/strict";
import {
  buildAttackInsights,
  buildSuspiciousSources,
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
assert.equal(report.flows[0]!.country, "中国");
assert.equal(report.flows[0]!.targetLabel, "ログイン・認証");
assert.equal(report.flows[0]!.count, 7);
assert.ok(report.byTarget.some((t) => t.targetKind === "stocks" && t.count === 3));
assert.ok(report.narrative.some((n) => n.includes("中国")));
assert.ok(report.byCountry.some((c) => c.country === "不明" && c.code === null && c.count === 1));
assert.ok(report.byCountry.some((c) => c.country === "アメリカ合衆国" && c.code === "US"));

const empty = buildAttackInsights([]);
assert.equal(empty.totalEvents, 0);
assert.match(empty.narrative[0]!, /ありません/);

const ev = (
  sourceHash: string,
  eventType: string,
  path: string,
  i: number,
  country: string | null = "RU",
) => ({
  sourceHash,
  eventType,
  country,
  path,
  attackLabel: eventType,
  createdAt: `2026-11-21T00:0${i}:00.000Z`,
});
const sus = buildSuspiciousSources([
  ...Array.from({ length: 6 }, (_, i) => ev("src-brute", "auth_denied", "/login", i)),
  ...Array.from({ length: 6 }, (_, i) => ev("src-scan", "invalid_request", `/wp-admin/${i}`, i, null)),
  ...Array.from({ length: 5 }, (_, i) => ev("src-flood", "rate_limited", "/api/x", i)),
  ...Array.from({ length: 4 }, (_, i) => ev("src-single", "rate_limited", "/api/x", i)),
]);
assert.equal(sus.length, 3, "4回以下は出さない");
assert.equal(sus.find((s) => s.sourceHash === "src-brute")!.pattern, "brute_force");
assert.equal(sus.find((s) => s.sourceHash === "src-brute")!.country, "ロシア");
assert.equal(sus.find((s) => s.sourceHash === "src-scan")!.pattern, "scan");
assert.equal(sus.find((s) => s.sourceHash === "src-scan")!.country, "不明");
assert.equal(sus.find((s) => s.sourceHash === "src-flood")!.pattern, "flood");
assert.deepEqual(buildSuspiciousSources([]), []);

console.log("security-attack-insights.test.ts: ok");
