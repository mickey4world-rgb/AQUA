import assert from "node:assert/strict";
import {
  polishSystemDebateText,
  softenLunaSpeech,
  stripHollowClumsyMeta,
  wrapHollowRpgAsides,
} from "../lib/server/soluna-note-debate-quality";

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

console.log("soluna-note-debate-quality.test OK");
