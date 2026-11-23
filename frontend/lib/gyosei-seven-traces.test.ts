/**
 * Run: npx --yes tsx lib/gyosei-seven-traces.test.ts
 */
import assert from "node:assert/strict";
import { buildSevenTracesBrief } from "./gyosei-seven-traces";
import type { MoneyFlowResponse } from "./types/gyosei";

const base: MoneyFlowResponse = {
  year: 2025,
  unit: "百万円",
  filters: {
    ministry: null,
    payee: null,
    sector: null,
    focusKind: null,
    focusValue: null,
  },
  totals: {
    amount: 1000,
    projectCount: 2,
    payeeCount: 3,
    flowCount: 4,
    truncated: true,
  },
  nodes: [],
  links: [],
  rows: [
    {
      ministry: "デジタル庁",
      project: "基盤A",
      projectNumber: "1",
      payee: "株式会社サンプル",
      amount: 400,
      block: "1",
      contract: "随意契約",
      work: "",
    },
    {
      ministry: "総務省",
      project: "基盤A",
      projectNumber: "1",
      payee: "株式会社サンプル",
      amount: 200,
      block: "1",
      contract: "随意契約",
      work: "",
    },
    {
      ministry: "デジタル庁",
      project: "基盤B",
      projectNumber: "2",
      payee: "その他",
      amount: 300,
      block: "2",
      contract: "一般競争入札",
      work: "",
    },
    {
      ministry: "デジタル庁",
      project: "基盤B",
      projectNumber: "2",
      payee: "フィクション商事",
      amount: 100,
      block: "2",
      contract: "公募",
      work: "",
    },
  ],
  source: {
    label: "test",
    publisher: "test",
    license: "test",
    url: "https://example.invalid",
  },
  availableYears: [2025],
  pendingYears: [],
  ministries: ["デジタル庁", "総務省"],
  sectors: [],
  externalCompanies: [],
  nearbyMunicipal: [],
  houjinEnabled: false,
  yearAvailable: true,
};

const brief = buildSevenTracesBrief(base);
assert.equal(brief.stamps.length, 7, "always 7 stamps");
assert.ok(brief.pressedCount >= 3, "fixture should press several stamps");
assert.ok(
  brief.stamps.every((s) => s.title && s.question && s.verdict),
  "each stamp has copy",
);
assert.ok(
  brief.stamps.find((s) => s.id === "truncated")?.pressed,
  "truncated stamp pressed",
);
assert.ok(
  brief.stamps.find((s) => s.id === "crossMinistry")?.pressed,
  "cross-ministry stamp pressed for サンプル",
);
assert.ok(
  brief.stamps.find((s) => s.id === "otherBucket")?.pressed,
  "other bucket pressed",
);

const idleOnly: MoneyFlowResponse = {
  ...base,
  totals: { ...base.totals, truncated: false },
  rows: [
    {
      ministry: "デジタル庁",
      project: "均衡A",
      projectNumber: "1",
      payee: "甲商事サンプル",
      amount: 110,
      block: "1",
      contract: "一般競争入札",
      work: "",
    },
    {
      ministry: "デジタル庁",
      project: "均衡B",
      projectNumber: "2",
      payee: "乙商事サンプル",
      amount: 100,
      block: "1",
      contract: "一般競争入札",
      work: "",
    },
    {
      ministry: "デジタル庁",
      project: "均衡C",
      projectNumber: "3",
      payee: "丙商事サンプル",
      amount: 90,
      block: "1",
      contract: "一般競争入札",
      work: "",
    },
    {
      ministry: "デジタル庁",
      project: "均衡D",
      projectNumber: "4",
      payee: "丁商事サンプル",
      amount: 80,
      block: "1",
      contract: "一般競争入札",
      work: "",
    },
  ],
};
const calm = buildSevenTracesBrief(idleOnly);
assert.equal(calm.stamps.length, 7);
assert.ok(
  calm.stamps.every((s) => s.verdict.length > 0),
  "idle stamps still explain",
);

console.log("gyosei-seven-traces.test.ts: ok");
