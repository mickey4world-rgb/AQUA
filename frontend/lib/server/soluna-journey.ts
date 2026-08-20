/**
 * ソル＆ルーナの世界地図（旅ロジック）
 * ニュースの国・ジャンルから本日の舞台を選び、次の目的地を決める。
 */
import type { SolunaNewsBriefing, SolunaNewsItem } from "@/lib/types/soluna";

export type SolunaAreaId =
  | "black-forest-trade"
  | "euro-mist-valley"
  | "silicon-oasis"
  | "yen-wilderness"
  | "rate-castle"
  | "inflation-swamp"
  | "cyber-shadow-ruin"
  | "energy-volcano";

export type SolunaJourneyArea = {
  id: SolunaAreaId;
  name: string;
  regionLabel: string;
  flavor: string;
  match: RegExp;
};

export const SOLUNA_WORLD_MAP: readonly SolunaJourneyArea[] = [
  {
    id: "black-forest-trade",
    name: "貿易摩擦の黒い森",
    regionLabel: "北米エリア",
    flavor: "関税の棘が道を塞ぎ、補給線が霧に隠れる森",
    match: /関税|貿易|保護主義|米国|アメリカ|トランプ|制裁|サプライ/,
  },
  {
    id: "euro-mist-valley",
    name: "ユーロ連邦の霧深き渓谷",
    regionLabel: "欧州エリア",
    flavor: "規制の霧と金利の風が交互に吹く渓谷",
    match: /EU|欧州|ヨーロッパ|ECB|ドイツ|フランス|イギリス|英/,
  },
  {
    id: "silicon-oasis",
    name: "半導体の砂漠・シリコンオアシス",
    regionLabel: "ハイテク魔導都市",
    flavor: "AIとチップの魔力が渦巻く砂漠のオアシス",
    match: /AI|半導体|チップ|NVIDIA|TSMC|LLM|生成AI|OpenAI|モデル|ハイテク/,
  },
  {
    id: "yen-wilderness",
    name: "日出ずる国の円安荒野",
    regionLabel: "日本エリア",
    flavor: "為替の砂嵐が財布を削る荒野",
    match: /円安|円高|日銀|日本|東京|賃金|春闘|GDP/,
  },
  {
    id: "rate-castle",
    name: "金利の浮遊城塞",
    regionLabel: "中央銀行圏",
    flavor: "利上げ・利下げの砲台が空に浮かぶ城",
    match: /金利|利下げ|利上げ|FRB|FOMC|中央銀行|債券/,
  },
  {
    id: "inflation-swamp",
    name: "インフレの黒い沼",
    regionLabel: "物価汚染地帯",
    flavor: "ポーション代がじわじわ上がる呪いの沼",
    match: /インフレ|物価|CPI|エネルギー価格|食料/,
  },
  {
    id: "cyber-shadow-ruin",
    name: "サイバー影の廃墟",
    regionLabel: "情報戦フロンティア",
    flavor: "漏洩と攻撃の影が這う廃墟",
    match: /サイバー|攻撃|漏洩|セキュリティ|ハッカー/,
  },
  {
    id: "energy-volcano",
    name: "エネルギー噴火口",
    regionLabel: "資源ベルト",
    flavor: "原油と電力の炎が噴き上がる火山帯",
    match: /原油|石油|電力|エネルギー|OPEC|ガス/,
  },
] as const;

const DEFAULT_AREA = SOLUNA_WORLD_MAP[0];

export function getAreaById(id: string | undefined): SolunaJourneyArea {
  return SOLUNA_WORLD_MAP.find((area) => area.id === id) ?? DEFAULT_AREA;
}

function scoreArea(area: SolunaJourneyArea, blob: string): number {
  const matches = blob.match(area.match);
  return matches ? matches.length + 1 : 0;
}

export function inferAreaFromBriefing(briefing: SolunaNewsBriefing): SolunaJourneyArea {
  const blob = [
    briefing.summary,
    ...briefing.items.map((item) => `${item.keyword} ${item.title} ${item.summary}`),
  ].join(" ");

  let best = DEFAULT_AREA;
  let bestScore = 0;
  for (const area of SOLUNA_WORLD_MAP) {
    const score = scoreArea(area, blob);
    if (score > bestScore) {
      best = area;
      bestScore = score;
    }
  }
  return best;
}

/** 今日の舞台以外から、ニュースの次点ジャンル or 巡回で次の目的地を選ぶ */
export function pickNextDestination(
  current: SolunaJourneyArea,
  briefing: SolunaNewsBriefing,
): SolunaJourneyArea {
  const blob = [
    briefing.summary,
    ...briefing.items.map((item) => `${item.keyword} ${item.title} ${item.summary}`),
  ].join(" ");

  const ranked = [...SOLUNA_WORLD_MAP]
    .filter((area) => area.id !== current.id)
    .map((area) => ({ area, score: scoreArea(area, blob) }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0]?.score > 0) return ranked[0].area;

  const idx = SOLUNA_WORLD_MAP.findIndex((area) => area.id === current.id);
  return SOLUNA_WORLD_MAP[(idx + 1) % SOLUNA_WORLD_MAP.length];
}

export function formatJourneyForPrompt(
  current: SolunaJourneyArea,
  next: SolunaJourneyArea,
  boss: SolunaNewsItem,
  trash: SolunaNewsItem[],
): string {
  const trashLines = trash
    .map((item, i) => {
      const m = item.monster;
      return `小物${i + 1}: Lv.${m?.rank ?? 2} ${m?.name ?? item.title}（正体: ${item.title}）`;
    })
    .join("\n");

  return `## 本日の冒険舞台
現在地: 『${current.name}』（${current.regionLabel}）
雰囲気: ${current.flavor}
次の目的地候補: 『${next.name}』（${next.regionLabel}）

## 本日の対戦カード
大ボス: Lv.${boss.monster?.rank ?? 5} ${boss.monster?.name ?? boss.title}（正体: ${boss.title}）
${trashLines || "小物: なし（偵察のみ）"}

会話では「今いる場所」と「小物→大ボス」の順で語ること。大ボスに逃げられても小物勝利で経験値を稼いだ余韻を残してよい。`;
}

/** Note 無料〜有料向けの冒険日誌ブロック */
export function formatAdventureLogForNote(battle: {
  bossName: string;
  bossRank: number;
  outcome: "victory" | "escape";
  newsPlain?: string;
  newsTitle?: string;
  encounters?: Array<{
    role: string;
    monsterName: string;
    rank: number;
    newsTitle: string;
    newsPlain: string;
    outcome: "victory" | "escape";
    xpGained: number;
    goldFlavor: number;
    lootName?: string | null;
  }>;
  wins?: number;
  losses?: number;
  goldFlavorTotal?: number;
  journey?: {
    areaName: string;
    regionLabel: string;
    nextAreaName: string;
  };
}): string {
  const place = battle.journey
    ? `2人は今、世界的な魔力が渦巻く『${battle.journey.areaName}（${battle.journey.regionLabel}）』を旅しています。`
    : `2人は今日もニュースの荒野を旅しています。`;

  const encounters = battle.encounters ?? [];
  const trash = encounters.filter((e) => e.role !== "boss");
  const bossEnc = encounters.find((e) => e.role === "boss");

  const trashBlocks =
    trash.length > 0
      ? trash
          .map((enc, i) => {
            const label = enc.outcome === "victory" ? "完全勝利" : "取り逃がし";
            return `⚔️ 第${i + 1}戦（小競り合い）：vs ${enc.monsterName}（Lv.${enc.rank}）

発生ニュース: ${enc.newsPlain}
結果: 【${label}】 経験値+${enc.xpGained} / ${enc.goldFlavor}ゴールド${enc.lootName ? ` / ${enc.lootName}` : ""}`;
          })
          .join("\n\n")
      : "";

  const bossBlock = `🐉 大ボス戦：vs ${battle.bossName}（Lv.${battle.bossRank}）

発生ニュース: ${battle.newsPlain ?? ""}
結果: 【${battle.outcome === "victory" ? "討伐成功" : "取り逃がし"}】${
    bossEnc
      ? ` 経験値+${bossEnc.xpGained}${bossEnc.lootName ? ` / ${bossEnc.lootName}` : ""}`
      : ""
  }`;

  const scoreLine =
    battle.wins !== undefined
      ? `本日の複数戦成績: ${battle.wins}勝${battle.losses ?? 0}敗（物語ゴールド合計 +${battle.goldFlavorTotal ?? 0}）`
      : "";

  const nextLine = battle.journey
    ? `次なる目的地: 2人は次に『${battle.journey.nextAreaName}』へ向けて移動を開始しました。`
    : "";

  return `## 🗺️ 本日のソル＆ルーナ冒険日誌

【現在の現在地】
${place}

${trashBlocks ? `${trashBlocks}\n\n` : ""}${bossBlock}

📊 本日の遠征成果
${scoreLine}
${
  battle.outcome === "escape" && (battle.wins ?? 0) > 0
    ? "大ボスには逃げられたが、小物討伐の利益を蒼竜のエサに補給！旅はまだまだ続く。"
    : battle.outcome === "victory"
      ? "大ボス討伐成功。収穫をギルド金庫へ！"
      : "厳しい一日。逃げ足の鱗を握りしめ、明日のリベンジへ。"
}
${nextLine}`;
}
