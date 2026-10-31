/**
 * 公開面は認証専用カテゴリを出さない／正規化で欠けたキーを埋める。
 * 空カテゴリは complete にしない（収集漏れの定時スキップ再発防止）。
 */
import assert from "node:assert/strict";
import {
  computeEnrichmentStatus,
  digestEmptyCategories,
} from "./server/works-news-search";
import {
  NEWS_SEARCH_AUTH_ONLY_CATEGORIES,
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
    deepDive: "深堀の本文が十分に長い内容です",
    outlook: "見通しの本文が十分に長い内容です",
    explanation: "解説の本文が十分に長い内容です",
    govRelevance: "官公庁示唆の本文",
    sources: [{ name: "t", url: "https://example.com/x" }],
    attentionScore: 80,
  };
}

{
  assert.ok(NEWS_SEARCH_CATEGORIES.includes("security"));
  assert.ok(NEWS_SEARCH_CATEGORIES.includes("national-security"));
  assert.ok(!NEWS_SEARCH_PUBLIC_CATEGORIES.includes("security"));
  assert.ok(!NEWS_SEARCH_PUBLIC_CATEGORIES.includes("national-security"));
  assert.deepEqual([...NEWS_SEARCH_AUTH_ONLY_CATEGORIES], [
    "security",
    "national-security",
  ]);
}

{
  const partial = normalizeNewsSearchCategories({
    ai: [sampleItem("ai")],
  });
  assert.equal(partial.ai.length, 1);
  assert.equal(partial.security.length, 0);
  assert.equal(partial["national-security"].length, 0);
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
      "national-security": [sampleItem("national-security")],
    },
  } satisfies NewsSearchDigest;

  assert.equal(digest.categories.security.length, 1);
  const publicDigest = toPublicNewsSearchDigest(digest);
  assert.equal(publicDigest.categories.security.length, 0, "公開面はセキュリティを空にする");
  assert.equal(
    publicDigest.categories["national-security"].length,
    0,
    "公開面は国家危機管理を空にする",
  );
  assert.equal(publicDigest.categories.ai.length, 1, "他カテゴリは残す");
  assert.equal(digest.categories.security.length, 1, "元ダイジェストは変更しない");
}

{
  const cats = emptyNewsSearchCategories();
  for (const key of NEWS_SEARCH_CATEGORIES) {
    if (key === "security") continue;
    cats[key] = [sampleItem(key)];
  }
  assert.deepEqual(digestEmptyCategories({ categories: cats }), ["security"]);
  assert.equal(computeEnrichmentStatus({ categories: cats }), "partial");
}

{
  const cats = emptyNewsSearchCategories();
  for (const key of NEWS_SEARCH_CATEGORIES) {
    cats[key] = [sampleItem(key)];
  }
  assert.deepEqual(digestEmptyCategories({ categories: cats }), []);
  assert.equal(computeEnrichmentStatus({ categories: cats }), "complete");
}

console.log("works-news-search-categories.test.ts: ok");
