/**
 * 公開面は「セキュリティ」を出さない／正規化で欠けたキーを埋める。
 */
import assert from "node:assert/strict";
import {
  NEWS_SEARCH_CATEGORIES,
  NEWS_SEARCH_PUBLIC_CATEGORIES,
  emptyNewsSearchCategories,
  normalizeNewsSearchCategories,
  toPublicNewsSearchDigest,
  type NewsSearchDigest,
  type NewsSearchItem,
} from "./types/works-news-search";

function sampleItem(category: NewsSearchItem["category"]): NewsSearchItem {
  return {
    id: `${category}-1`,
    category,
    title: `${category} headline`,
    summary: "s",
    deepDive: "d",
    outlook: "o",
    explanation: "e",
    govRelevance: "g",
    sources: [{ name: "t", url: "https://example.com/x" }],
    attentionScore: 80,
  };
}

{
  assert.ok(NEWS_SEARCH_CATEGORIES.includes("security"));
  assert.ok(!NEWS_SEARCH_PUBLIC_CATEGORIES.includes("security"));
  assert.deepEqual(
    [...NEWS_SEARCH_PUBLIC_CATEGORIES],
    ["ai", "systems", "economy", "government"],
  );
}

{
  const partial = normalizeNewsSearchCategories({
    ai: [sampleItem("ai")],
  });
  assert.equal(partial.ai.length, 1);
  assert.equal(partial.security.length, 0);
  for (const key of NEWS_SEARCH_CATEGORIES) {
    assert.ok(Array.isArray(partial[key]), `missing key ${key}`);
  }
}

{
  const digest = {
    id: "works-news-search-2026-10-31",
    fetchedAt: new Date().toISOString(),
    source: "mixed" as const,
    summary: "s",
    solunaSynced: false,
    categories: {
      ...emptyNewsSearchCategories(),
      ai: [sampleItem("ai")],
      security: [sampleItem("security")],
    },
  } satisfies NewsSearchDigest;

  assert.equal(digest.categories.security.length, 1);
  const publicDigest = toPublicNewsSearchDigest(digest);
  assert.equal(publicDigest.categories.security.length, 0, "公開面はセキュリティを空にする");
  assert.equal(publicDigest.categories.ai.length, 1, "他カテゴリは残す");
  assert.equal(digest.categories.security.length, 1, "元ダイジェストは変更しない");
}

console.log("works-news-search-categories.test.ts: ok");
