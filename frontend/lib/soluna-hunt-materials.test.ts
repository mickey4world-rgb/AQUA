import assert from "node:assert/strict";
import {
  digestHighAttentionCount,
  selectSolunaHuntSeedItems,
  solunaHuntMaterialsMeetContract,
} from "./soluna-hunt-materials";
import { mapDigestToSolunaSeedItems } from "./server/works-news-search";
import type { NewsSearchDigest, NewsSearchItem } from "./types/works-news-search";

function item(
  partial: Partial<NewsSearchItem> &
    Pick<NewsSearchItem, "id" | "category" | "title" | "attentionScore">,
): NewsSearchItem {
  return {
    summary: partial.summary ?? partial.title,
    explanation: partial.explanation ?? partial.title,
    deepDive: "d",
    outlook: "o",
    govRelevance: "g",
    sources: [{ name: "t", url: `https://example.com/${partial.id}` }],
    ...partial,
  };
}

const digest = {
  id: "works-news-search-2026-10-31",
  fetchedAt: new Date().toISOString(),
  source: "mixed",
  summary: "s",
  solunaSynced: false,
  categories: {
    ai: [
      item({
        id: "a-low",
        category: "ai",
        title: "Quiet AI tip",
        attentionScore: 40,
      }),
      item({
        id: "a-high",
        category: "ai",
        title: "Frontier model launch",
        attentionScore: 92,
        titleJa: "最先端モデル発表",
      }),
    ],
    economy: [
      item({
        id: "e-mid",
        category: "economy",
        title: "Mild market move",
        attentionScore: 70,
      }),
    ],
    systems: [
      item({
        id: "s-high",
        category: "systems",
        title: "Major cloud outage hits banks",
        attentionScore: 88,
        titleJa: "大手クラウド障害が銀行に波及",
      }),
    ],
    government: [
      item({
        id: "g-low",
        category: "government",
        title: "Local filing notice",
        attentionScore: 35,
      }),
    ],
    security: [],
    "national-security": [],
  },
} as NewsSearchDigest;

assert.equal(digestHighAttentionCount(digest), 2);

const seeds = selectSolunaHuntSeedItems(digest);
assert.equal(seeds.length, 3);
assert.ok((seeds[0]?.attentionScore ?? 0) >= 80, "1件目は高注目");
assert.ok((seeds[1]?.attentionScore ?? 0) >= 80, "2件目は高注目");
assert.ok(
  (seeds[0]?.attentionScore ?? 0) >= (seeds[1]?.attentionScore ?? 0),
  "注目度降順",
);
assert.ok(
  (seeds[2]?.attentionScore ?? 0) <= (seeds[1]?.attentionScore ?? 0),
);
assert.equal(
  seeds.filter((s) => s.attentionScore >= 80).length,
  2,
  "3件中2件は注目度≥80",
);

const contract = solunaHuntMaterialsMeetContract(
  seeds,
  digestHighAttentionCount(digest),
);
assert.equal(contract.ok, true);

const mapped = mapDigestToSolunaSeedItems(digest);
assert.equal(mapped.length, 3);
assert.ok((mapped[0]?.attentionScore ?? 0) >= 80, "先頭は一般読者向け高注目");
assert.ok(
  mapped.some((s) => s.title.includes("cloud outage") || s.titleJa?.includes("クラウド")),
  "systems の高注目も材料に入る",
);

// 旧ロジック（ai/economy だけ）だと systems 88 が落ち、高注目が1件になる退化を防ぐ
assert.ok(
  !mapped.every((s) => s.keyword.includes("AI") || s.keyword.includes("経済")),
);

// 実務点だけ高い政府細目より、話題性のある経済本丸を先に取る
{
  const nicheHeavy = {
    ...digest,
    categories: {
      ...digest.categories,
      government: [
        item({
          id: "g-high-works",
          category: "government",
          title: "Local filing notice and procurement checklist update",
          summary: "庁内向けの調達仕様の小さな改定。",
          explanation: "庁内向けの調達仕様の小さな改定と入札公告の案内。",
          attentionScore: 96,
          publishedAt: new Date().toISOString(),
        }),
      ],
      economy: [
        item({
          id: "e-fed",
          category: "economy",
          title: "Fed signals rate path as markets surge",
          summary: "FRBの示唆で株が急騰した。",
          explanation: "FRBの示唆で株が急騰し、金利見通しが焦点になった。",
          attentionScore: 78,
          publishedAt: new Date().toISOString(),
          titleJa: "FRB示唆で市場急騰",
        }),
      ],
      ai: [
        item({
          id: "a-mid",
          category: "ai",
          title: "Quiet AI tip",
          attentionScore: 40,
        }),
      ],
      systems: [],
      security: [],
      "national-security": [],
    },
  } as NewsSearchDigest;

  const noteSeeds = selectSolunaHuntSeedItems(nicheHeavy);
  assert.ok(
    noteSeeds.some((s) => s.title.includes("Fed") || s.titleJa?.includes("FRB")),
    "話題性の高い経済ニュースが材料に入る",
  );
  assert.ok(
    !noteSeeds[0]?.title.includes("procurement"),
    "庁内調達の実務高点だけで大ボス先頭にしない",
  );
}

console.log("soluna-hunt-materials.test.ts: ok");
