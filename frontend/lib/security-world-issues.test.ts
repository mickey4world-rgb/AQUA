import assert from "node:assert/strict";
import {
  assessWorldSecurityIssues,
  defaultWorldIssueContext,
  worldIssuesSummaryLabel,
} from "./security-world-issues";

const swa = assessWorldSecurityIssues(
  defaultWorldIssueContext({
    nodeMajor: 22,
    behindSwaEdge: true,
    exposesRawNodeHttpServer: false,
    usesNodeMtlsPerHost: false,
    recentDependencyPatches: true,
  }),
);

const http2 = swa.find((i) => i.id === "nodejs-2026-11-http2-tls");
assert.ok(http2);
assert.equal(http2!.judgment, "watch");
assert.match(http2!.reason, /SWA/);

const mtls = swa.find((i) => i.id === "nodejs-2026-11-mtls-sni");
assert.ok(mtls);
assert.equal(mtls!.judgment, "not_applicable");

const supply = swa.find((i) => i.id === "supply-chain-autopatch");
assert.ok(supply);
assert.equal(supply!.judgment, "mitigated");

const summary = worldIssuesSummaryLabel(swa);
assert.equal(summary.level, "warn");

const exposed = assessWorldSecurityIssues(
  defaultWorldIssueContext({
    behindSwaEdge: false,
    exposesRawNodeHttpServer: true,
  }),
);
assert.equal(
  exposed.find((i) => i.id === "nodejs-2026-11-http2-tls")!.judgment,
  "affected",
);
assert.equal(worldIssuesSummaryLabel(exposed).level, "critical");

const otherNode = assessWorldSecurityIssues(
  defaultWorldIssueContext({ nodeMajor: 18 }),
);
assert.equal(
  otherNode.find((i) => i.id === "nodejs-2026-11-http2-tls")!.judgment,
  "not_applicable",
);

console.log("security-world-issues.test.ts: ok");
