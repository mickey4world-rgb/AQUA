import assert from "node:assert/strict";
import { scoreStockNewsAffinity } from "../lib/stock-news-affinity";
import type { NewsSearchDigest } from "../lib/types/works-news-search";
import { scoreTakeProfitEase } from "../lib/stock-weekly-rotation";

function digestFixture(): NewsSearchDigest {
  return {
    id: "works-news-search-2026-10-01",
    fetchedAt: "2026-10-01T19:00:00.000Z",
    source: "rss+gemini",
    solunaSynced: false,
    summary: "test",
    enrichmentStatus: "complete",
    categories: {
      ai: [
        {
          id: "1",
          category: "ai",
          title: "GPU datacenter demand lifts AI chip makers",
          titleJa: "GPUデータセンター需要でAI半導体が上昇",
          summary: "Semiconductor testers and lasers",
          deepDive: "レーザーテックやアドバンテストへの波及",
          outlook: "続く",
          explanation: "説明",
          govRelevance: "",
          sources: [],
          attentionScore: 85,
        },
      ],
      systems: [],
      economy: [
        {
          id: "2",
          category: "economy",
          title: "Shipping rates soften",
          titleJa: "海運運賃が軟調",
          summary: "container",
          deepDive: "川崎汽船など",
          outlook: "",
          explanation: "",
          govRelevance: "",
          sources: [],
          attentionScore: 60,
        },
      ],
      government: [],
    },
  };
}

{
  const digest = digestFixture();
  const semi = scoreStockNewsAffinity({
    code: "6920",
    name: "レーザーテック",
    tags: ["semi"],
    digest,
  });
  assert.ok(semi.bonus > 0, `semi bonus expected >0 got ${semi.bonus}`);
  assert.ok(semi.hitCount >= 1);
  assert.ok(semi.matchedCategories.includes("ai") || semi.matchedKeywords.length > 0);

  const cover = scoreStockNewsAffinity({
    code: "5253",
    name: "カバー",
    tags: ["entertainment"],
    digest,
  });
  assert.equal(cover.bonus, 0, "unrelated tag should not match AI/shipping digest");

  const missing = scoreStockNewsAffinity({
    code: "4689",
    name: "LINEヤフー",
    tags: ["ai"],
    digest: null,
  });
  assert.equal(missing.bonus, 0, "missing digest must not penalize");
}

{
  const digest = digestFixture();
  const news = scoreStockNewsAffinity({
    code: "3778",
    name: "さくらインターネット",
    tags: ["ai", "cloud"],
    digest,
  });
  const withNews = scoreTakeProfitEase({
    code: "3778",
    name: "さくらインターネット",
    price: 2000,
    changePct: 0,
    tier: "core",
    heldShares: 0,
    currentlyActive: false,
    newsFitBonus: news.bonus,
    newsFitReasons: [`News +${news.bonus}`],
  });
  const without = scoreTakeProfitEase({
    code: "3778",
    name: "さくらインターネット",
    price: 2000,
    changePct: 0,
    tier: "core",
    heldShares: 0,
    currentlyActive: false,
    newsFitBonus: 0,
  });
  assert.ok(withNews.score > without.score);
  assert.ok(withNews.reasons.some((r) => r.includes("News")));
}

console.log("stock-news-affinity.test.ts: ok");
