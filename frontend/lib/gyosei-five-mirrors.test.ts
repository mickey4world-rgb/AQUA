/**
 * Run: npx --yes tsx lib/gyosei-five-mirrors.test.ts
 */
import assert from "node:assert/strict";
import {
  buildContractMix,
  buildFiveMirrorsBrief,
  buildTopPayeeShares,
  fiveMirrorsFocusDescription,
  isSoleSourceContractLabel,
  soleSourceShareOf,
} from "./gyosei-five-mirrors";
import type { MoneyFlowResponse } from "./types/gyosei";

assert.equal(isSoleSourceContractLabel("随意契約"), true);
assert.equal(isSoleSourceContractLabel("一般競争入札"), false);
assert.equal(isSoleSourceContractLabel(null), false);

const rows = [
  {
    ministry: "デジタル庁",
    project: "基盤A",
    projectNumber: "001",
    payee: "株式会社サンプル",
    amount: 600,
    block: "1",
    contract: "随意契約",
    work: "",
  },
  {
    ministry: "デジタル庁",
    project: "基盤A",
    projectNumber: "001",
    payee: "フィクション商事",
    amount: 300,
    block: "1",
    contract: "一般競争入札",
    work: "",
  },
  {
    ministry: "デジタル庁",
    project: "基盤B",
    projectNumber: "002",
    payee: "株式会社サンプル",
    amount: 100,
    block: "2",
    contract: "公募",
    work: "",
  },
];

const mix = buildContractMix(rows);
assert.ok(mix.length >= 2);
assert.equal(mix[0]!.method, "随意契約");
assert.ok(Math.abs(mix[0]!.share - 0.6) < 1e-9);

const tops = buildTopPayeeShares(rows, 3);
assert.equal(tops[0]!.name, "株式会社サンプル");
assert.ok(Math.abs(tops[0]!.share - 0.7) < 1e-9);

const sole = soleSourceShareOf(rows);
assert.ok(sole != null && Math.abs(sole - 0.7) < 1e-9);

const data = {
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
    payeeCount: 2,
    flowCount: 3,
    truncated: false,
  },
  nodes: [
    { id: "g", label: "政府", kind: "government", amount: 1000 },
    { id: "m1", label: "デジタル庁", kind: "ministry", amount: 1000, drillable: true },
  ],
  links: [],
  rows,
  source: {
    label: "test",
    publisher: "test",
    license: "CC BY 4.0",
    url: "https://example.invalid",
  },
  availableYears: [2025],
  pendingYears: [],
  ministries: ["デジタル庁"],
  sectors: [],
  externalCompanies: [],
  nearbyMunicipal: [],
  houjinEnabled: false,
  yearAvailable: true,
} as MoneyFlowResponse;

const brief = buildFiveMirrorsBrief(data, null);
assert.equal(brief.cards.length, 5);
assert.equal(brief.cards[0]!.title, "源流");
assert.equal(brief.cards[1]!.title, "水量");
assert.equal(brief.cards[2]!.title, "着地");
assert.equal(brief.cards[3]!.title, "選び方");
assert.equal(brief.cards[4]!.title, "疑いの旗");
assert.match(brief.cards[1]!.answer, /1,000/);
assert.ok(brief.contractMix.length > 0);
assert.ok(brief.topPayees.length > 0);
assert.ok(brief.flags.length > 0);
assert.ok(brief.officialLinks.some((l) => l.href.includes("rssystem.go.jp")));
assert.match(
  fiveMirrorsFocusDescription(null, brief),
  /公開五鏡/,
);

const focused = buildFiveMirrorsBrief(data, {
  id: "m1",
  label: "デジタル庁",
  kind: "ministry",
  amount: 1000,
  drillable: true,
});
assert.equal(focused.activeMirror, "source");
assert.match(focused.scopeLabel, /デジタル庁/);

console.log("gyosei-five-mirrors.test.ts: ok");
