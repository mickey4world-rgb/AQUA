import assert from "node:assert/strict";
import {
  assessWorldFeed,
  assessWorldSecurityIssues,
  buildWorldFeedMeta,
  defaultWorldIssueContext,
  parseWorldFeed,
  worldIssuesSummaryLabel,
} from "./security-world-issues";

const raw = {
  fetchedAt: "2026-11-21T22:05:00.000Z",
  nodeMajor: 22,
  sources: [
    { source: "cisa-kev", ok: true, count: 3, checkedAt: "2026-11-21T22:05:01.000Z" },
    { source: "nodejs", ok: true, count: 2, checkedAt: "2026-11-21T22:05:02.000Z" },
    { source: "ghsa-npm", ok: false, count: 0, checkedAt: "2026-11-21T22:05:03.000Z", error: "HTTP 503" },
    { source: "evil", ok: true, count: 9 },
  ],
  items: [
    { origin: "cisa-kev", id: "CVE-2026-0001", title: "サンプル製品 RCE", vendor: "SampleVendor", product: "Sample Router", publishedAt: "2026-11-20", severity: "critical", ransomware: true, url: "https://nvd.nist.gov/vuln/detail/CVE-2026-0001" },
    { origin: "cisa-kev", id: "CVE-2026-0002", title: "Node.js 問題", vendor: "Node.js", product: "Node.js", publishedAt: "2026-11-19", severity: "critical", url: "https://nvd.nist.gov/vuln/detail/CVE-2026-0002" },
    { origin: "cisa-kev", id: "CVE-2026-0003", title: "lib 問題", vendor: "sample", product: "sample-lib", packageName: "sample-lib", installedVersion: "1.0.0", publishedAt: "2026-11-18", severity: "critical", url: "https://nvd.nist.gov/vuln/detail/CVE-2026-0003" },
    { origin: "nodejs", id: "nodejs-v22.99.1", title: "Node.js v22.99.1 セキュリティ更新", nodeMajor: 22, publishedAt: "2026-11-10", severity: "high", url: "https://nodejs.org/en/blog/vulnerability" },
    { origin: "nodejs", id: "nodejs-v26.1.1", title: "Node.js v26.1.1 セキュリティ更新", nodeMajor: 26, publishedAt: "2026-11-10", severity: "high", url: "https://nodejs.org/en/blog/vulnerability" },
    { origin: "ghsa-npm", id: "GHSA-aaaa-bbbb-cccc", title: "pkg-a 脆弱性", packageName: "pkg-a", publishedAt: "2026-11-15", severity: "high", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" },
    { origin: "ghsa-npm", id: "GHSA-dddd-eeee-ffff", title: "pkg-b 脆弱性", packageName: "pkg-b", publishedAt: "2026-11-15", severity: "critical", url: "https://github.com/advisories/GHSA-dddd-eeee-ffff" },
    { origin: "cisa-kev", id: "X", title: "bad url", url: "javascript:alert(1)" },
  ],
};

const feed = parseWorldFeed(raw);
assert.ok(feed);
assert.equal(feed!.sources.length, 3, "unknown source dropped");
assert.equal(feed!.items.length, 7, "non-https url dropped");

const ctx = defaultWorldIssueContext({
  nodeMajor: 22,
  openAdvisoryIds: new Set(["GHSA-AAAA-BBBB-CCCC"]),
  openAdvisoryPackages: new Set(["pkg-a"]),
});
const out = assessWorldFeed(feed!, ctx);
const by = (id: string) => out.find((i) => i.id === id)!;

assert.equal(by("CVE-2026-0001").judgment, "not_applicable");
assert.match(by("CVE-2026-0001").reason, /使っていません/);
assert.equal(by("CVE-2026-0001").ransomware, true);
assert.equal(by("CVE-2026-0002").judgment, "watch");
assert.equal(by("CVE-2026-0003").judgment, "mitigated", "in lockfile but audit clean");
assert.equal(by("nodejs-v22.99.1").judgment, "watch");
assert.equal(by("nodejs-v26.1.1").judgment, "not_applicable");
assert.equal(by("GHSA-aaaa-bbbb-cccc").judgment, "affected");
assert.equal(by("GHSA-dddd-eeee-ffff").judgment, "mitigated");
assert.equal(out[0]!.judgment, "affected", "affected sorted first");

const meta = buildWorldFeedMeta(feed, out);
assert.equal(meta.live, true);
assert.equal(meta.fetchedAt, "2026-11-21T22:05:00.000Z");
assert.equal(meta.notApplicable, 2);
assert.equal(meta.sources.find((s) => s.source === "ghsa-npm")!.ok, false);

assert.equal(worldIssuesSummaryLabel(out).level, "critical");

const noFeed = buildWorldFeedMeta(null, assessWorldSecurityIssues());
assert.equal(noFeed.live, false);
assert.equal(parseWorldFeed(undefined), null);
assert.equal(parseWorldFeed({ items: [] }), null, "fetchedAt required");

const exposed = assessWorldSecurityIssues(
  defaultWorldIssueContext({ behindSwaEdge: false, exposesRawNodeHttpServer: true }),
);
assert.equal(worldIssuesSummaryLabel(exposed).level, "critical");

console.log("security-world-issues.test.ts: ok");
