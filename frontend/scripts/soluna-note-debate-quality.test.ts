import assert from "node:assert/strict";
import {
  NOTE_DEBATE_DEEP_READ_RULE,
  polishSystemDebateText,
  softenLunaSpeech,
  stripHollowClumsyMeta,
  stripNbspArtifacts,
  wrapHollowRpgAsides,
} from "../lib/server/soluna-note-debate-quality";
import {
  formatSolunaNewsHeadlineWithJa,
  formatSolunaNewsSummaryWithJa,
} from "../lib/soluna-news-display";
import { toNoteHtml } from "../lib/server/soluna-note-article";

assert.equal(
  softenLunaSpeech("ルーナだ。続きを読もう。"),
  "ルーナよ。続きを読もう。",
);
assert.equal(softenLunaSpeech("大丈夫だぞ！"), "大丈夫よ！");
assert.ok(
  softenLunaSpeech("要点は米国製プラットフォームを使って拡散されている点だ。").includes(
    "点だ。",
  ),
  "一般の「〜だ。」は壊さない",
);

assert.equal(
  wrapHollowRpgAsides(
    "補給線の新たな流れを見極めると現場の動きが変わる予感。",
  ),
  "（補給線の新たな流れを見極めると現場の動きが変わる予感。）",
);
assert.equal(
  wrapHollowRpgAsides(
    "補給線が塞がれる、つまり物流が滞る話だ。",
  ),
  "補給線が塞がれる、つまり物流が滞る話だ。",
);

const stripped = stripHollowClumsyMeta(
  "事実はこうだ。おっちょこちょいの私がひとつだけ言い忘れないよう、注意するね。続きを見よう。",
);
assert.ok(!stripped.includes("おっちょこちょいの私"));
assert.ok(stripped.includes("事実はこうだ。"));
assert.ok(stripped.includes("続きを見よう。"));

const polished = polishSystemDebateText(
  "luna",
  "ルーナだ。補給線の新たな流れを見極めると現場の動きが変わる予感。おっちょこちょいの私が言い忘れないよう、注意するね。",
);
assert.ok(polished.startsWith("ルーナよ。"));
assert.ok(polished.includes("（補給線"));
assert.ok(!polished.includes("おっちょこちょいの私"));

// &nbsp; 除去
assert.equal(stripNbspArtifacts("hello&nbsp;&nbsp;world"), "hello world");
assert.equal(stripNbspArtifacts("a\u00a0b"), "a b");
const nbspPolished = polishSystemDebateText("sol", "事実&nbsp;&nbsp;はこうだ。");
assert.ok(!nbspPolished.includes("&nbsp;"));
assert.ok(nbspPolished.includes("事実 はこうだ。") || nbspPolished.includes("事実はこうだ。"));

const html = toNoteHtml("段落&nbsp;&nbsp;です。\n\n次の段落。");
assert.ok(!html.html.includes("&nbsp;"), "toNoteHtml は &nbsp; を残さない");
assert.ok(!html.html.includes("&amp;nbsp;"), "エスケープ後の &nbsp; も残さない");

// 英語のあとに日本語訳
const headline = formatSolunaNewsHeadlineWithJa({
  title: "Markets Rally After Fed Signal",
  titleJa: "FRBの示唆で市場が上昇",
});
assert.ok(headline.startsWith("Markets Rally After Fed Signal"));
assert.ok(headline.includes("（日本語: FRBの示唆で市場が上昇）"));

const summary = formatSolunaNewsSummaryWithJa({
  summary: "Stocks rose as investors priced in a slower path for rate hikes.",
  summaryJa: "投資家が利上げペースの鈍化を織り込み、株が上昇した。",
});
assert.ok(summary.startsWith("Stocks rose"));
assert.ok(summary.includes("（日本語:"));

assert.ok(NOTE_DEBATE_DEEP_READ_RULE.includes("深読みすると"));
assert.ok(NOTE_DEBATE_DEEP_READ_RULE.includes("気を付けていこう"));

console.log("soluna-note-debate-quality.test OK");
