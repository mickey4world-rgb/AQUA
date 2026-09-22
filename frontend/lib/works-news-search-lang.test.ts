/**
 * Run: npx --yes tsx lib/works-news-search-lang.test.ts
 */
import assert from "node:assert/strict";
import {
  looksPrimarilyEnglish,
  newsItemNeedsJapaneseTranslation,
} from "./works-news-search-lang";
import {
  newsItemPrimaryTitle,
  newsItemSecondaryTitle,
} from "./works-news-search-display";

assert.equal(
  looksPrimarilyEnglish("OpenAI launches new model for enterprise customers"),
  true,
);
assert.equal(looksPrimarilyEnglish("デジタル庁がAI調達ガイドラインを改定"), false);
assert.equal(looksPrimarilyEnglish("AI"), false);

assert.equal(
  newsItemNeedsJapaneseTranslation({
    title: "Microsoft expands Azure AI regions in Europe",
    summary: "The company said demand for GPUs continues to rise.",
  }),
  true,
);
assert.equal(
  newsItemNeedsJapaneseTranslation({
    title: "Microsoft expands Azure AI regions in Europe",
    summary: "The company said demand for GPUs continues to rise.",
    titleJa: "マイクロソフトが欧州で Azure AI リージョンを拡大",
    summaryJa: "GPU 需要の拡大が続くと説明した。",
  }),
  false,
);

assert.equal(
  newsItemPrimaryTitle({
    title: "English title here for testing",
    titleJa: "日本語タイトル",
  }),
  "日本語タイトル",
);
assert.equal(
  newsItemSecondaryTitle({
    title: "English title here for testing",
    titleJa: "日本語タイトル",
  }),
  "English title here for testing",
);

console.log("works-news-search-lang.test.ts: ok");
