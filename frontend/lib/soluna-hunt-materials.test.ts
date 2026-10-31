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
  },
} as NewsSearchDigest;

assert.equal(digestHighAttentionCount(digest), 2);

const seeds = selectSolunaHuntSeedItems(digest);
assert.equal(seeds.length, 3);
assert.equal(seeds[0]?.attentionScore, 92);
assert.equal(seeds[1]?.attentionScore, 88);
assert.ok((seeds[2]?.attentionScore ?? 0) <= 88);
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
assert.equal(mapped[0]?.attentionScore, 92);
assert.ok(
  mapped.some((s) => s.title.includes("cloud outage") || s.titleJa?.includes("クラウド")),
  "systems の高注目も材料に入る",
);

// 旧ロジック（ai/economy だけ）だと systems 88 が落ち、高注目が1件になる退化を防ぐ
assert.ok(
  !mapped.every((s) => s.keyword.includes("AI") || s.keyword.includes("経済")),
);

console.log("soluna-hunt-materials.test.ts: ok");
