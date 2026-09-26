/**
 * Run: npx --yes tsx lib/soluna-hunt-improvements.test.ts
 */
import assert from "node:assert/strict";
import { pickBoss, enrichBriefingWithMonsters } from "./soluna-monsters";
import {
  solunaNewsPrimaryTitle,
  solunaNewsPrimarySummary,
  solunaNewsSecondaryTitle,
  solunaNewsNeedsJapanese,
} from "./soluna-news-display";
import type { SolunaNewsBriefing } from "./types/soluna";
import { mapDigestToSolunaSeedItems } from "./server/works-news-search";
import type { NewsSearchDigest } from "./types/works-news-search";

{
  assert.equal(
    solunaNewsPrimaryTitle({
      title: "OpenAI releases new model",
      titleJa: "OpenAIが新モデルを発表",
    }),
    "OpenAIが新モデルを発表",
  );
  assert.equal(
    solunaNewsSecondaryTitle({
      title: "OpenAI releases new model",
      titleJa: "OpenAIが新モデルを発表",
    }),
    "OpenAI releases new model",
  );
  assert.equal(
    solunaNewsNeedsJapanese({
      title: "OpenAI releases new model",
      summary: "The company announced a major update for developers.",
    }),
    true,
  );
  assert.equal(
    solunaNewsNeedsJapanese({
      title: "OpenAI releases new model",
      summary: "The company announced a major update for developers.",
      titleJa: "OpenAIが新モデルを発表",
      summaryJa: "開発者向けの大型更新を発表した。",
    }),
    false,
  );
}

{
  const briefing: SolunaNewsBriefing = {
    id: "works-news-search-2026-09-26",
    keywords: ["AI 最新動向", "世界経済"],
    fetchedAt: new Date().toISOString(),
    summary: "test",
    items: [
      {
        title: "低注目の小ネタ",
        summary: "あまり話題になっていない話",
        keyword: "AI 最新動向",
        attentionScore: 40,
      },
      {
        title: "高注目の大ニュース",
        summary: "みんなが見ている話",
        keyword: "世界経済",
        attentionScore: 92,
      },
      {
        title: "中くらい",
        summary: "そこそこ",
        keyword: "AI 最新動向",
        attentionScore: 70,
      },
    ],
  };
  const boss = pickBoss(briefing);
  assert.equal(solunaNewsPrimaryTitle(boss), "高注目の大ニュース");
  assert.equal(boss.attentionScore, 92);
}

{
  const enriched = enrichBriefingWithMonsters({
    id: "x",
    keywords: ["AI 最新動向"],
    fetchedAt: new Date().toISOString(),
    summary: "s",
    items: [
      {
        title: "English headline about markets",
        summary: "Something happened in global finance today.",
        keyword: "世界経済",
        titleJa: "市場に関する英語見出し",
        summaryJa: "今日の世界金融で何かが起きた。",
        attentionScore: 88,
      },
    ],
  });
  assert.equal(enriched.items[0]?.titleJa, "市場に関する英語見出し");
  assert.equal(enriched.items[0]?.attentionScore, 88);
  assert.equal(
    solunaNewsPrimarySummary(enriched.items[0]!),
    "今日の世界金融で何かが起きた。",
  );
}

{
  const digest = {
    id: "works-news-search-2026-09-26",
    fetchedAt: new Date().toISOString(),
    source: "mixed",
    summary: "s",
    categories: {
      ai: [
        {
          id: "a1",
          category: "ai",
          title: "Quiet AI note",
          summary: "small",
          explanation: "small",
          deepDive: "x",
          outlook: "x",
          govRelevance: "x",
          attentionScore: 30,
          sources: [{ name: "t", url: "https://example.com/a" }],
          titleJa: "静かなAIメモ",
          summaryJa: "小さな話",
        },
        {
          id: "a2",
          category: "ai",
          title: "Huge model launch shocks industry",
          summary: "A major lab shipped a frontier model overnight.",
          explanation: "A major lab shipped a frontier model overnight.",
          deepDive: "x",
          outlook: "x",
          govRelevance: "x",
          attentionScore: 95,
          sources: [{ name: "t", url: "https://example.com/b" }],
          titleJa: "巨大モデル発表が業界を揺るがす",
          summaryJa: "大手が最先端モデルを一晩で出荷した。",
        },
      ],
      economy: [],
      systems: [],
      government: [],
    },
  } as unknown as NewsSearchDigest;

  const seeds = mapDigestToSolunaSeedItems(digest);
  assert.ok(seeds.length >= 1);
  assert.equal(seeds[0]?.attentionScore, 95);
  assert.equal(seeds[0]?.titleJa, "巨大モデル発表が業界を揺るがす");
  assert.equal(seeds[0]?.title, "Huge model launch shocks industry");
}

console.log("soluna-hunt-improvements.test.ts: ok");
