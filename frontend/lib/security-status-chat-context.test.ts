/**
 * Run: npx --yes tsx lib/security-status-chat-context.test.ts
 */
import assert from "node:assert/strict";
import { buildSecurityChatContext } from "./server/security-status-chat";
import { buildSecurityStackInventory } from "./security-stack";
import type { SecurityAnalyticsReport } from "./types/analytics";

const stack = buildSecurityStackInventory(new Date("2026-11-23T01:00:00.000Z"));

const report = {
  month: "2026-11",
  monthLabel: "2026年11月",
  summary: {
    blockedEvents: 1,
    highSeverityEvents: 0,
    uniqueSources: 1,
    affectedPaths: 1,
  },
  architectureLayers: [
    {
      id: "app",
      title: "③ アプリ API",
      role: "業務",
      defenses: ["レート制限"],
      components: stack.layers.find((l) => l.layerId === "app")!.components,
    },
  ],
  stackInventory: {
    generatedAt: stack.generatedAt,
    nodeMajor: stack.nodeMajor,
    summary: stack.summary,
    clarifications: stack.clarifications,
  },
  worldIssues: [
    {
      id: "CVE-2026-0001",
      title: "サンプル RCE",
      publishedAt: "2026-11-20",
      severity: "critical",
      judgment: "not_applicable",
      judgmentLabel: "非該当",
      reason: "使っていない",
      sourceUrl: "https://nvd.nist.gov/vuln/detail/CVE-2026-0001",
      origin: "cisa-kev",
      ransomware: true,
    },
  ],
  worldIssuesSummary: { level: "ok", text: "問題ありは 0 件" },
  worldFeedMeta: {
    fetchedAt: "2026-11-23T00:00:00.000Z",
    live: true,
    sources: [],
    scanned: 1,
    notApplicable: 1,
  },
  attackInsights: {
    flows: [],
    byCountry: [],
    byTarget: [],
    narrative: ["記録はテスト1件のみ"],
    totalEvents: 1,
  },
  byTypeDetail: [],
  suspiciousSources: [],
  countryCoverage: { known: 0, total: 1, note: "" },
  byType: [],
  byCountry: [],
  byDay: [],
  recentEvents: [],
  coverageNote: "アプリ層の記録のみ",
  latestTriage: {
    dateJst: "2026-11-23",
    generatedAt: "2026-11-23T01:00:00.000Z",
    ageHours: 2,
    level: "ok",
    headline: "問題なし",
    summary: "未解決の重大・高なし",
    reasons: [],
    actions: [],
    aiStatus: "ok",
    aiModel: "gemini-flash-latest",
    aiReason: null,
    counts: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
    issues: [],
    collections: [],
    events: null,
    openSecurityPrs: [],
    appliedAutoPatches: [],
    modelSelection: null,
  },
  triageHistory: [],
  activeAutoBlocks: [],
} as unknown as SecurityAnalyticsReport;

const ctx = buildSecurityChatContext(report, "2026-11-23T01:05:00.000Z");
assert.match(ctx, /Next\.js/);
assert.match(ctx, /Hono/);
assert.match(ctx, /未使用\/間接|間接/);
assert.match(ctx, /サンプル RCE/);
assert.match(ctx, /遮断 1 回/);
assert.match(ctx, /問題なし/);

console.log("security-status-chat-context.test.ts: ok");
