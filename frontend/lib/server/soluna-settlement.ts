/**
 * BOINC 社会貢献 → 拠点都市「アクアピア」の開拓ロジック
 * 投入分数（累積）で施設が建ち、合併で村→町→都市へ進化する。
 */
import type {
  SolunaSettlementDayEvent,
  SolunaSettlementFacility,
  SolunaSettlementLevel,
  SolunaSettlementState,
} from "@/lib/types/soluna";

type Blueprint = {
  id: string;
  name: string;
  location: string;
  unlockAt: number;
  kind: "build" | "merge" | "slot";
  levelLabel: string;
  settlementLevel: SolunaSettlementLevel;
  settlementName?: string;
  mergeOf?: string[];
  slotsGranted?: number;
  topicBuild: string;
  topicMerge?: string;
  solLine: string;
  lunaLine: string;
};

const BLUEPRINTS: readonly Blueprint[] = [
  {
    id: "eurus-windmill",
    name: "魔導風車【エウルス】",
    location: "街の北側",
    unlockAt: 30,
    kind: "build",
    levelLabel: "村レベル",
    settlementLevel: "village",
    topicBuild:
      "エネルギーが一定値に達し、街の北側に魔導風車【エウルス】が完成（村レベル）しました！",
    solLine: "おおっ、風車が回った！まだ村レベルだけど、計算の風が街に吹き始めたな！",
    lunaLine:
      "みんなの解析パワー（BOINC）で、ついに最初のクリーンエネルギー施設が完成したわ。明日はどこを開拓しようかしら？",
  },
  {
    id: "spirit-aqueduct",
    name: "精霊の魔導水路",
    location: "南側の水源地",
    unlockAt: 75,
    kind: "build",
    levelLabel: "村レベル",
    settlementLevel: "village",
    topicBuild:
      "昨日の風車に続き、本日は南側の水源地から【精霊の魔導水路】の敷設が完了（村レベル）しました！",
    solLine:
      "水路ができたか！畑にも綺麗な水が行き届くな。でも北の風車と南の水路、まだバラバラで効率が悪そうじゃないか？",
    lunaLine:
      "ふふ、焦らないでソル。この2つが揃ったということは、明日いよいよ『あの計画』が始動する合図よ……！",
  },
  {
    id: "aquapia-town-merge",
    name: "魔導水耕街アクアピア",
    location: "拠点全域",
    unlockAt: 135,
    kind: "merge",
    levelLabel: "町レベル",
    settlementLevel: "town",
    settlementName: "魔導水耕街アクアピア",
    mergeOf: ["eurus-windmill", "spirit-aqueduct"],
    slotsGranted: 1,
    topicBuild: "",
    topicMerge:
      "魔導風車【エウルス】の風力と【精霊の魔導水路】の水力が融合！2つの施設が合併し、村からワンランク上の【魔導水耕街アクアピア（町レベル）】へ大進化を遂げました！",
    solLine: "やったぜ！風と水が繋がって、街そのものが動き出した！",
    lunaLine:
      "ついにやったわ！循環街（タウン）が誕生したの。町になったことで、スパコンの『宇宙分析スロット』が1つ解放されたわ。有料購読でパワーを送り続けてくれたギルドメンバーに感謝よ！",
  },
  {
    id: "star-observatory",
    name: "星詠み観測塔",
    location: "中央広場",
    unlockAt: 220,
    kind: "build",
    levelLabel: "町レベル",
    settlementLevel: "town",
    topicBuild:
      "中央広場に【星詠み観測塔】が完成！宇宙分析の視界が広がり、遠方のニュースモンスターを早期警戒できるようになりました。",
    solLine: "塔から星が見える！次の大物モンスターの気配も、ここから読めるかもな！",
    lunaLine: "観測塔で前兆を拾えば、旅のルート選びが賢くなるわ。みんなのパワーが街の目になったのよ。",
  },
  {
    id: "analysis-slot-2",
    name: "第二宇宙分析スロット",
    location: "計算殿",
    unlockAt: 300,
    kind: "slot",
    levelLabel: "町レベル",
    settlementLevel: "town",
    slotsGranted: 1,
    topicBuild:
      "計算殿に【第二宇宙分析スロット】が解放！並行して星の謎を解ける枠がもう1つ増えました。",
    solLine: "スロットが増えた！これで同時に2つの星の謎に突っ込めるぜ！",
    lunaLine: "購読の輪が広がるほど、街の計算容量も増える。ギルドの力そのものね。",
  },
  {
    id: "aquapia-city",
    name: "魔導循環都市アクアピア",
    location: "拠点全域",
    unlockAt: 420,
    kind: "merge",
    levelLabel: "都市レベル",
    settlementLevel: "city",
    settlementName: "魔導循環都市アクアピア",
    slotsGranted: 1,
    topicMerge:
      "観測塔と分析スロットが連動し、町から【魔導循環都市アクアピア（都市レベル）】へ昇格！食料・エネルギー・宇宙解析が自律運転する都市回路が完成しました。",
    topicBuild: "",
    solLine: "都市だ……！アクアピアが本当のギルド首都になったな！",
    lunaLine:
      "都市化おめでとう。ここから先は、さらに深い星域のニュースに挑めるはずよ。みんな、ありがとう。",
  },
] as const;

export function defaultSettlementState(): SolunaSettlementState {
  return {
    cumulativeMinutes: 0,
    settlementLevel: "village",
    settlementName: "開拓村アクアピア",
    facilities: [],
    analysisSlots: 0,
    latestEvent: null,
    updatedAt: new Date().toISOString(),
  };
}

function levelLabelJa(level: SolunaSettlementLevel): string {
  if (level === "city") return "都市";
  if (level === "town") return "町";
  return "村";
}

/**
 * 本日の BOINC 分数を加算し、閾値を超えた施設を解放する
 */
export function advanceSettlement(
  previous: SolunaSettlementState | null,
  todayMinutes: number,
  briefingId: string,
): SolunaSettlementState {
  const base = previous ?? defaultSettlementState();
  const before = base.cumulativeMinutes;
  const after = before + Math.max(0, todayMinutes);
  const owned = new Set(base.facilities.map((f) => f.id));
  const newlyUnlocked: Blueprint[] = [];

  for (const bp of BLUEPRINTS) {
    if (owned.has(bp.id)) continue;
    if (before < bp.unlockAt && after >= bp.unlockAt) {
      newlyUnlocked.push(bp);
      owned.add(bp.id);
    }
  }

  const newFacilities: SolunaSettlementFacility[] = [
    ...base.facilities,
    ...newlyUnlocked.map((bp) => ({
      id: bp.id,
      name: bp.name,
      location: bp.location,
      builtAt: new Date().toISOString(),
      briefingId,
      levelLabel: bp.levelLabel,
    })),
  ];

  let settlementLevel = base.settlementLevel;
  let settlementName = base.settlementName;
  let analysisSlots = base.analysisSlots;
  for (const bp of newlyUnlocked) {
    if (bp.settlementLevel === "town" || bp.settlementLevel === "city") {
      settlementLevel = bp.settlementLevel;
    }
    if (bp.settlementName) settlementName = bp.settlementName;
    if (bp.slotsGranted) analysisSlots += bp.slotsGranted;
  }

  const primary = newlyUnlocked[newlyUnlocked.length - 1];
  let event: SolunaSettlementDayEvent;

  if (primary) {
    const kind: SolunaSettlementDayEvent["kind"] =
      primary.kind === "merge" ? "merge" : primary.kind === "slot" ? "slot" : "build";
    const topic =
      kind === "merge"
        ? primary.topicMerge ?? primary.topicBuild
        : newlyUnlocked.map((bp) => bp.topicBuild || bp.topicMerge || "").filter(Boolean).join("\n");
    event = {
      kind,
      briefingId,
      createdAt: new Date().toISOString(),
      todayMinutes,
      cumulativeMinutes: after,
      headline:
        kind === "merge"
          ? `🌟 緊急特報：アクアピア開拓史に残る大進化！（${levelLabelJa(settlementLevel)}レベルへ）`
          : `🏗️ 新施設完成：${primary.name}`,
      topic,
      solComment: primary.solLine,
      lunaComment: primary.lunaLine,
      unlockedFacilityIds: newlyUnlocked.map((bp) => bp.id),
      settlementLevel,
      analysisSlots,
    };
  } else {
    const next = BLUEPRINTS.find((bp) => !owned.has(bp.id));
    const remain = next ? Math.max(0, next.unlockAt - after) : 0;
    event = {
      kind: "progress",
      briefingId,
      createdAt: new Date().toISOString(),
      todayMinutes,
      cumulativeMinutes: after,
      headline: "🏡 開拓は着実に進行中",
      topic: next
        ? `次の目標『${next.name}』まで、あと約 ${remain} 分の解析パワー。今日の ${todayMinutes} 分も地盤を固めたわ。`
        : `主要施設は一通り揃った。今日も ${todayMinutes} 分の解析で街の魔導回路を回し続けている。`,
      solComment: `今日も ${todayMinutes} 分ぶん、宇宙の計算を回した！街の灯りがまた少し明るくなったな。`,
      lunaComment: next
        ? `累積 ${after} 分。焦らず積み上げれば、次は『${next.name}』よ。`
        : `累積 ${after} 分。都市の自律運転を見守るフェーズね。`,
      unlockedFacilityIds: [],
      settlementLevel,
      analysisSlots,
    };
  }

  return {
    cumulativeMinutes: after,
    settlementLevel,
    settlementName,
    facilities: newFacilities,
    analysisSlots,
    latestEvent: event,
    updatedAt: new Date().toISOString(),
  };
}

/** Note 有料エリア用の開拓日誌テキスト */
export function formatSettlementDiary(settlement: SolunaSettlementState | null | undefined): string {
  if (!settlement?.latestEvent) {
    return `## 🏡 本日の拠点都市開拓日誌

みんなの応援エネルギー（BOINC）が届き次第、後方の開拓が始まります。
最初の目標は魔導風車【エウルス】の建設です。`;
  }

  const ev = settlement.latestEvent;
  const facilitiesLine =
    settlement.facilities.length > 0
      ? settlement.facilities
          .map((f) => `・${f.name}（${f.location} / ${f.levelLabel}）`)
          .join("\n")
      : "・まだ施設なし（整地中）";

  return `## 🏡 本日の拠点都市開拓日誌

2人が最前線で激闘を繰り広げる裏で、みんなの応援エネルギーによって後方の開拓が進みました。

${ev.kind === "merge" ? `${ev.headline}\n` : ""}${ev.kind === "build" || ev.kind === "slot" ? `${ev.headline}\n` : ""}🌀 本日の投入パワー: BOINC宇宙分析 ${ev.todayMinutes} 分（累積 ${ev.cumulativeMinutes} 分）
🏙️ 拠点: ${settlement.settlementName}（${levelLabelJa(settlement.settlementLevel)}レベル）
🔓 宇宙分析スロット: ${settlement.analysisSlots}

🏗️ 開拓トピックス:
${ev.topic}

📋 現在の施設一覧:
${facilitiesLine}

⚔️ ソル「${ev.solComment}」
📖 ルーナの賢者メモ:
「${ev.lunaComment}」`;
}
