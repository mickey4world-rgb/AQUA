import assert from "node:assert/strict";
import {
  composeDailyNote,
  splitNewsTension,
} from "../lib/server/soluna-note-article";
import type {
  SolunaBattleResult,
  SolunaHunterState,
  SolunaNewsBriefing,
} from "../lib/types/soluna";

const tension = splitNewsTension(
  "企業が自社の制御不能に陥った技術に対して法的責任を負うべきだと考えている。しかし、法学の専門家たちは現行法では線引きが難しいと指摘する。",
);
assert.ok(tension.claim.includes("法的責任"));
assert.ok(tension.counter?.includes("法学の専門家"));

const briefing = {
  id: "b1",
  fetchedAt: "2026-10-03T00:00:00.000Z",
  summary: "AI責任と市場",
  items: [
    {
      id: "i1",
      title: "AI liability debate",
      titleJa: "AIの法的責任をめぐる議論",
      summary:
        "Companies should bear legal responsibility for tech they cannot control. Legal experts disagree.",
      summaryJa:
        "企業が自社の制御不能に陥った技術に対して法的責任を負うべきだと考えている。しかし、法学の専門家たちは現行法では線引きが難しいと指摘する。",
      url: "https://example.com/a",
      source: "Reuters",
      publishedAt: "2026-10-03T00:00:00.000Z",
      keyword: "AI責任",
      monster: { name: "責任逃れの影狼", rank: 2, species: "shadow", speciesLabel: "影狼", weakness: "法の線引き" },
    },
    {
      id: "i2",
      title: "Markets Rally After Fed Signal",
      titleJa: "FRBの示唆で市場が上昇",
      summary: "Stocks rose on the Fed signal.",
      summaryJa: "FRBの示唆で株が上昇した。金利見通しが焦点。",
      url: "https://example.com/b",
      source: "Reuters",
      publishedAt: "2026-10-03T00:00:00.000Z",
      keyword: "金利",
      monster: { name: "金利の蒼竜", rank: 5, species: "dragon", speciesLabel: "竜", weakness: "次の会合" },
    },
  ],
} as SolunaNewsBriefing;

const battle = {
  id: "bat1",
  createdAt: "2026-10-03T01:00:00.000Z",
  outcome: "victory",
  heat: 0.62,
  depth: 0.55,
  bossName: "金利の蒼竜",
  bossRank: 5,
  newsTitle: "FRBの示唆で市場が上昇",
  newsPlain: "FRBの示唆で株が上昇した。金利見通しが焦点。",
  outcomeWhy: "初動を読めた",
  impression: "金利の急所が見えた朝",
  nextMove: "明日のCPIと為替を見る",
  loot: { medal: "silver", xpGained: 10, itemName: null, itemFlavor: null },
  wins: 2,
  losses: 0,
  goldFlavorTotal: 100,
  encounters: [
    {
      role: "trash",
      monsterName: "責任逃れの影狼",
      rank: 2,
      newsTitle: "AIの法的責任をめぐる議論",
      newsPlain:
        "企業が自社の制御不能に陥った技術に対して法的責任を負うべきだと考えている。しかし、法学の専門家たちは現行法では線引きが難しいと指摘する。",
      outcome: "victory",
      xpGained: 8,
      goldFlavor: 160,
    },
    {
      role: "boss",
      monsterName: "金利の蒼竜",
      rank: 5,
      newsTitle: "FRBの示唆で市場が上昇",
      newsPlain: "FRBの示唆で株が上昇した。金利見通しが焦点。",
      outcome: "victory",
      xpGained: 40,
      goldFlavor: 900,
    },
  ],
} as SolunaBattleResult;

const hunter = {
  level: 3,
  medals: { bronze: 1, silver: 1, gold: 0, rainbow: 0 },
  xp: 10,
} as SolunaHunterState;

const note = composeDailyNote({
  briefing,
  battle,
  hunter,
  messages: [],
  boincMinutes: 5,
});

assert.ok(note.freeBody.includes("Markets Rally After Fed Signal"));
assert.ok(note.freeBody.includes("（日本語: FRBの示唆で市場が上昇）"));
assert.ok(!note.freeBody.includes("原題:"));
assert.ok(note.freeBody.includes("英語のあとに日本語訳"));

// 無料: 気になる点と白熱状況が読めることを明言
assert.ok(note.freeBody.includes("各試合ごとの「気になる点」"));
assert.ok(note.freeBody.includes("議論の白熱状況"));
assert.ok(note.freeBody.includes("気になる点:"));
assert.ok(note.freeBody.includes("白熱状況:"));
assert.ok(
  note.freeBody.includes("そこまで白熱するほど熱い会議ではなく終わった——だから小物モンスター"),
);

// 有料: 1試合ごとの丁寧な討論
assert.ok(note.paidBody.includes("試合ごとの丁寧な討論"));
assert.ok(note.paidBody.includes("第1試合"));
assert.ok(note.paidBody.includes("第2試合"));
assert.ok(note.paidBody.includes("法学の専門家"));
assert.ok(note.paidBody.includes("だから小物モンスターだった"));

assert.ok(note.paidBody.includes("ギルド受付の子"));
assert.ok(
  note.paidBody.includes("心配していたの、あなたが無事に戻ってきたこと。"),
);
assert.ok(note.paidBody.includes("あの子の言葉、わたしも同じ気持ちよ"));
assert.ok(
  note.paidBody.includes("わたしの感想としては、明日のCPIと為替を見る"),
);

const receptionIdx = note.paidBody.indexOf(
  "心配していたの、あなたが無事に戻ってきたこと。",
);
const lunaAfter = note.paidBody.indexOf("あの子の言葉", receptionIdx);
assert.ok(receptionIdx > 0 && lunaAfter > receptionIdx, "受付→ルーナ感想の順");

assert.ok(note.paidBody.includes("深読みすると") || note.paidBody.includes("深読み"));
assert.ok(note.paidBody.includes("気を付けていこう"));
assert.ok(!note.freeHtml.includes("&nbsp;"));
assert.ok(!note.paidHtml.includes("&nbsp;"));

console.log("soluna-note-article-polish.test OK");
