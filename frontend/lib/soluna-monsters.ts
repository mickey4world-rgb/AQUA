import type {
  SolunaMonsterRank,
  SolunaMonsterSpecies,
  SolunaNewsBriefing,
  SolunaNewsItem,
  SolunaNewsMonster,
} from "@/lib/types/soluna";

const SPECIES_LABEL: Record<SolunaMonsterSpecies, string> = {
  dragon: "竜",
  slime: "スライム",
  golem: "ゴーレム",
  shadow: "影狼",
  chimera: "キメラ",
};

const RANK_HP: Record<SolunaMonsterRank, number> = {
  1: 48,
  2: 64,
  3: 82,
  4: 104,
  5: 128,
};

const HARD_MARKERS = [
  "規制",
  "制裁",
  "危機",
  "崩壊",
  "戦争",
  "インフレ",
  "金利",
  "法案",
  "独占",
  "破綻",
  "サイバー",
  "安全保障",
  "地政学",
  "量子",
  "AGI",
  "利下げ",
  "利上げ",
  "関税",
];

const NAME_SEEDS: Array<{
  match: RegExp;
  name: string;
  species: SolunaMonsterSpecies;
  rankBoost: number;
  weakness: string;
}> = [
  { match: /規制|法案|EU|ガバナンス/, name: "レギュラ", species: "dragon", rankBoost: 1, weakness: "誰が縛られ、誰が得するか" },
  { match: /金利|利下げ|利上げ|ECB|FRB|中央銀行/, name: "イージ", species: "slime", rankBoost: 1, weakness: "次の会合までの市場の読み" },
  { match: /インフレ|物価|賃金/, name: "インフレイト", species: "golem", rankBoost: 1, weakness: "生活実感と数字のズレ" },
  { match: /為替|円安|ドル/, name: "フォレック", species: "shadow", rankBoost: 1, weakness: "誰の財布が先に痛むか" },
  { match: /AI|モデル|LLM|生成/, name: "ニューラル", species: "chimera", rankBoost: 1, weakness: "現場で何が本当に変わるか" },
  { match: /半導体|チップ|TSMC|NVIDIA/, name: "シリコン", species: "golem", rankBoost: 1, weakness: "供給と需要のどちらが先に折れるか" },
  { match: /戦争|紛争|ミサイル|地政/, name: "ストーム", species: "dragon", rankBoost: 2, weakness: "連鎖する二次被害の地図" },
  { match: /関税|貿易|保護主義/, name: "バリア", species: "golem", rankBoost: 1, weakness: "価格転嫁の行き先" },
  { match: /サイバー|攻撃|漏洩/, name: "ファントム", species: "shadow", rankBoost: 1, weakness: "守るべき急所はどこか" },
  { match: /雇用|失業|労働/, name: "ワークラ", species: "slime", rankBoost: 0, weakness: "人の暮らしへの時間差" },
];

function clampRank(value: number): SolunaMonsterRank {
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  return rounded as SolunaMonsterRank;
}

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function inferRank(title: string, summary: string): SolunaMonsterRank {
  const blob = `${title} ${summary}`;
  const hits = HARD_MARKERS.reduce((sum, marker) => sum + (blob.includes(marker) ? 1 : 0), 0);
  const lengthBoost = summary.length > 70 ? 1 : 0;
  return clampRank(2 + Math.min(3, hits) + lengthBoost);
}

function pickSeed(title: string, summary: string, keyword: string) {
  const blob = `${keyword} ${title} ${summary}`;
  return NAME_SEEDS.find((seed) => seed.match.test(blob));
}

function defaultSpecies(keyword: string, seed: number): SolunaMonsterSpecies {
  if (keyword.includes("経済")) {
    return (["slime", "golem", "shadow"] as const)[seed % 3];
  }
  return (["dragon", "chimera", "golem"] as const)[seed % 3];
}

function decorateName(base: string, species: SolunaMonsterSpecies, seed: number): string {
  const prefixes = ["暁の", "暴走", "凍てつく", "黄金の", "霧の", "深淵"];
  const prefix = prefixes[seed % prefixes.length];
  const speciesLabel = SPECIES_LABEL[species];
  return `${prefix}${speciesLabel}${base}`;
}

export function monsterizeNewsItem(
  item: SolunaNewsItem,
  extras?: { monsterName?: string; rank?: number; species?: string },
): SolunaNewsItem {
  if (item.monster?.name) return item;

  const seedMatch = pickSeed(item.title, item.summary, item.keyword);
  const hash = hashSeed(`${item.keyword}:${item.title}`);
  const requestedSpecies = extras?.species;
  const species =
    requestedSpecies && requestedSpecies in SPECIES_LABEL
      ? (requestedSpecies as SolunaMonsterSpecies)
      : (seedMatch?.species ?? defaultSpecies(item.keyword, hash));
  const rank = extras?.rank
    ? clampRank(extras.rank)
    : clampRank((seedMatch?.rankBoost ?? 0) + inferRank(item.title, item.summary));
  const name =
    extras?.monsterName?.trim() ||
    decorateName(seedMatch?.name ?? (item.keyword.includes("経済") ? "マーケット" : "コード"), species, hash);
  const hpMax = RANK_HP[rank];

  const monster: SolunaNewsMonster = {
    name,
    species,
    speciesLabel: SPECIES_LABEL[species],
    rank,
    hp: hpMax,
    hpMax,
    weakness: seedMatch?.weakness ?? "数字の裏にある『誰の話か』",
  };

  return { ...item, monster };
}

export function enrichBriefingWithMonsters(briefing: SolunaNewsBriefing): SolunaNewsBriefing {
  return {
    ...briefing,
    items: briefing.items.map((item) => {
      const raw = item as SolunaNewsItem & {
        monsterName?: string;
        rank?: number;
        species?: string;
      };
      return monsterizeNewsItem(
        { title: raw.title, summary: raw.summary, keyword: raw.keyword, sourceUrl: raw.sourceUrl, monster: raw.monster },
        { monsterName: raw.monsterName, rank: raw.rank, species: raw.species },
      );
    }),
  };
}

export function formatEncounterForPrompt(briefing: SolunaNewsBriefing): string {
  const enriched = enrichBriefingWithMonsters(briefing);
  const lines = enriched.items.map((item, index) => {
    const monster = item.monster;
    const header = monster
      ? `${index + 1}. 【Lv.${monster.rank} ${monster.speciesLabel}】${monster.name}`
      : `${index + 1}. ${item.title}`;
    return `${header}
   正体（元ニュース）: ${item.title}
   要点: ${item.summary}
   弱点: ${monster?.weakness ?? "論点の急所"}
   キーワード: ${item.keyword}${item.sourceUrl ? `\n   出典: ${item.sourceUrl}` : ""}`;
  });

  return `## 本日の討伐対象（${briefing.fetchedAt.slice(0, 10)}）
${briefing.summary}

${lines.join("\n\n")}

読者がニュースを知っていても『続きが読みたい』と思えるように、怪物の生態＝ニュースの意味を噛み砕いて語ること。`;
}

export function pickBoss(briefing: SolunaNewsBriefing): SolunaNewsItem {
  const items = enrichBriefingWithMonsters(briefing).items;
  if (items.length === 0) {
    return monsterizeNewsItem({
      title: "霧の無名獣",
      summary: "ニュースが届いていません。",
      keyword: "AI 最新動向",
    });
  }
  return [...items].sort((a, b) => (b.monster?.rank ?? 1) - (a.monster?.rank ?? 1))[0];
}

/** 大ボス以外からランク低めを最大 max 体（小物〜中ボス） */
export function pickTrashMobs(briefing: SolunaNewsBriefing, max = 2): SolunaNewsItem[] {
  const enriched = enrichBriefingWithMonsters(briefing);
  const boss = pickBoss(enriched);
  return enriched.items
    .filter((item) => item.title !== boss.title)
    .sort((a, b) => (a.monster?.rank ?? 1) - (b.monster?.rank ?? 1))
    .slice(0, max);
}

export const SOLUNA_SPECIES_LABEL = SPECIES_LABEL;
