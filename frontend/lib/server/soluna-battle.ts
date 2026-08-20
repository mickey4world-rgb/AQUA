import { randomUUID } from "crypto";
import {
  CONFLICT_MARKERS,
  countMarkers,
  PRAISE_MARKERS,
} from "@/lib/server/soluna-system-config";
import { enrichBriefingWithMonsters, pickBoss, pickTrashMobs } from "@/lib/soluna-monsters";
import {
  getAreaById,
  inferAreaFromBriefing,
  pickNextDestination,
} from "@/lib/server/soluna-journey";
import type {
  SolunaBattleLoot,
  SolunaBattleOutcome,
  SolunaBattleResult,
  SolunaEncounterResult,
  SolunaHunterInventoryItem,
  SolunaHunterState,
  SolunaMedalKind,
  SolunaNewsBriefing,
  SolunaNewsItem,
  SolunaSystemMessage,
} from "@/lib/types/soluna";

const ITEM_POOL = [
  { name: "太陽の欠片", flavor: "ソルの攻めが通った余熱" },
  { name: "月の雫", flavor: "ルーナが急所を見切った冷静さ" },
  { name: "議論の盾", flavor: "反論を受け止めて深みが出た証" },
  { name: "予測の眼鏡", flavor: "次に起きることの輪郭" },
  { name: "次の一手メモ", flavor: "人間側の宿題が1行に凝縮" },
  { name: "続きの羽根", flavor: "明日の討伐へ誘うしおり" },
] as const;

const ESCAPE_ITEM = { name: "逃げ足の鱗", flavor: "取り逃した怪物の残香。リベンジの手がかり" };

export function medalUnitScore(medals: SolunaHunterState["medals"]): number {
  return medals.bronze + medals.silver * 2 + medals.gold * 4 + medals.rainbow * 8;
}

export function defaultHunterState(): SolunaHunterState {
  return {
    level: 1,
    xp: 0,
    xpIntoLevel: 0,
    xpForNext: xpForLevel(1),
    medals: { bronze: 0, silver: 0, gold: 0, rainbow: 0 },
    inventory: [],
    battles: [],
    updatedAt: new Date().toISOString(),
  };
}

export function xpForLevel(level: number): number {
  return 60 + Math.max(0, level - 1) * 25;
}

export function withLevelProgress(hunter: Omit<SolunaHunterState, "xpIntoLevel" | "xpForNext"> & Partial<SolunaHunterState>): SolunaHunterState {
  let level = Math.max(1, hunter.level);
  let remaining = Math.max(0, hunter.xp);
  let need = xpForLevel(level);
  while (remaining >= need && level < 99) {
    remaining -= need;
    level += 1;
    need = xpForLevel(level);
  }
  return {
    ...defaultHunterState(),
    ...hunter,
    level,
    xp: hunter.xp,
    xpIntoLevel: remaining,
    xpForNext: need,
    medals: hunter.medals ?? defaultHunterState().medals,
    inventory: hunter.inventory ?? [],
    battles: hunter.battles ?? [],
    updatedAt: hunter.updatedAt ?? new Date().toISOString(),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hashPick<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 33 + seed.charCodeAt(i)) | 0;
  return items[Math.abs(hash) % items.length];
}

export function evaluateDebateHeat(messages: SolunaSystemMessage[]): { heat: number; depth: number } {
  const dialogue = messages.filter((message) => message.role === "sol" || message.role === "luna");
  const combined = dialogue.map((message) => message.content).join("\n");
  const lengthScore = clamp01(combined.length / 520);
  const praise = countMarkers(combined, PRAISE_MARKERS);
  const conflict = countMarkers(combined, CONFLICT_MARKERS);
  const clashScore = clamp01(conflict / 4);
  const sparkScore = clamp01((praise + conflict) / 6);
  const questionScore = clamp01((combined.match(/[？?]/g)?.length ?? 0) / 3);
  const futureScore = clamp01(
    (combined.match(/今後|次は|ウォッチ|備え|提案|明日/g)?.length ?? 0) / 3,
  );
  const heat = clamp01(lengthScore * 0.28 + clashScore * 0.34 + sparkScore * 0.2 + questionScore * 0.18);
  const depth = clamp01(lengthScore * 0.35 + futureScore * 0.35 + clashScore * 0.3);
  return { heat, depth };
}

function decideOutcome(heat: number, depth: number, rank: number): SolunaBattleOutcome {
  const power = heat * 0.65 + depth * 0.35;
  const escapeLine = 0.38 + rank * 0.03;
  if (power < escapeLine) return "escape";
  if (heat < 0.22) return "escape";
  return "victory";
}

function medalFor(rank: number, heat: number, outcome: SolunaBattleOutcome): SolunaMedalKind | null {
  if (outcome !== "victory") return null;
  if (rank >= 4 && heat >= 0.72) return "rainbow";
  if (rank >= 4) return "gold";
  if (rank >= 3) return "silver";
  return "bronze";
}

function buildOutcomeWhy(outcome: SolunaBattleOutcome, heat: number, depth: number): string {
  if (outcome === "escape") {
    if (heat < 0.22) {
      return "2人の話がかみ合わず、ニュースの核心まで届きませんでした。";
    }
    return "論点は出ましたが、結論が一つにまとまらず、取り逃がしました。";
  }
  if (heat >= 0.7 && depth >= 0.55) {
    return "議論が白熱し、「何が起きたか／なぜ大事か／次に何を見るか」まで言語化できました。";
  }
  if (heat >= 0.5) {
    return "ニュースの要点は押さえられました。もう一段、利害の急所まで掘れたら完璧です。";
  }
  return "大きな筋は共有できました。細部のたとえは少なめですが、討伐は成立しています。";
}

function buildImpression(
  outcome: SolunaBattleOutcome,
  heat: number,
  depth: number,
  messages: SolunaSystemMessage[],
): string {
  const sol = messages.find((message) => message.role === "sol")?.content ?? "";
  const luna = messages.find((message) => message.role === "luna")?.content ?? "";
  const solBite = sol.replace(/\s+/g, " ").slice(0, 36);
  const lunaBite = luna.replace(/\s+/g, " ").slice(0, 36);

  if (outcome === "escape") {
    if (heat < 0.22) {
      return "たとえも結論も途中で止まり、読者が置いてきぼりになる展開でした。";
    }
    return `ソルは「${solBite}…」、ルーナは「${lunaBite}…」まで迫りましたが、一本に結べませんでした。`;
  }

  if (heat >= 0.7 && depth >= 0.55) {
    return "ソルのたとえとルーナの補強がかみ合い、ニュースが立体になりました。";
  }
  if (heat >= 0.5) {
    return "意見がぶつかったおかげで、ニュースの芯が分かりやすくなりました。";
  }
  return "落ち着いた解説戦。読みやすい一方、もう一声のたとえがあると続きが欲しくなります。";
}

function buildNextMove(briefing: SolunaNewsBriefing, outcome: SolunaBattleOutcome): string {
  const blob = `${briefing.summary} ${briefing.items.map((item) => item.title).join(" ")}`;
  if (/金利|利下げ|利上げ|ECB|FRB/.test(blob)) {
    return outcome === "escape"
      ? "次の会合までの市場の温度を、もう一度数字で測り直そう。"
      : "次の金利発表と為替の初動をウォッチ。家計と投資、どちらが先に揺れるかをメモ。";
  }
  if (/規制|法案|EU/.test(blob)) {
    return outcome === "escape"
      ? "規制の『対象外』に逃げる動きがないか、企業発表を追う。"
      : "企業の対応スケジュールと、現場の実務が変わる日をカレンダーに書く。";
  }
  if (/AI|モデル|半導体/.test(blob)) {
    return "『発表』と『実装』のギャップを見る。来週のプロダクト更新が本物かどうか。";
  }
  return outcome === "escape"
    ? "弱点をもう一度言い直して、明日の討伐に持ち越そう。"
    : "今日の結論を1行にして、明日のニュースで検証する。";
}

function decideTrashOutcome(heat: number, depth: number, rank: number): SolunaBattleOutcome {
  const power = heat * 0.55 + depth * 0.45;
  const escapeLine = 0.22 + rank * 0.04;
  if (power < escapeLine && heat < 0.2) return "escape";
  return "victory";
}

function resolveEncounter(
  item: SolunaNewsItem,
  role: SolunaEncounterResult["role"],
  heat: number,
  depth: number,
): SolunaEncounterResult {
  const rank = (item.monster?.rank ?? 2) as SolunaEncounterResult["rank"];
  const outcome =
    role === "boss" ? decideOutcome(heat, depth, rank) : decideTrashOutcome(heat, depth, rank);
  const xpGained =
    role === "boss"
      ? outcome === "victory"
        ? 12 + rank * 8 + Math.round(heat * 18)
        : 4 + rank * 2
      : outcome === "victory"
        ? 5 + rank * 3
        : 2;
  const goldFlavor =
    outcome === "victory" ? (role === "boss" ? 400 + rank * 100 : 120 + rank * 40) : 0;

  return {
    role,
    monsterName: item.monster?.name ?? item.title,
    rank,
    newsTitle: item.title,
    newsPlain: item.summary,
    outcome,
    xpGained,
    goldFlavor,
    lootName:
      outcome === "escape" && role === "boss"
        ? ESCAPE_ITEM.name
        : outcome === "victory" && role !== "boss"
          ? "魔力結晶の欠片"
          : null,
  };
}

function formatRecap(result: SolunaBattleResult): string {
  const medalLabel: Record<SolunaMedalKind, string> = {
    bronze: "銅メダル",
    silver: "銀メダル",
    gold: "金メダル",
    rainbow: "虹メダル",
  };
  const resultLabel = result.outcome === "victory" ? "討伐成功" : "取り逃がし";
  const lootBits = [
    result.loot.medal ? medalLabel[result.loot.medal] : "メダルなし",
    result.loot.itemName ?? "アイテムなし",
    `経験値 +${result.loot.xpGained}`,
  ];
  const score =
    result.wins !== undefined
      ? `複数戦: ${result.wins}勝${result.losses ?? 0}敗 / 物語ゴールド +${result.goldFlavorTotal ?? 0}`
      : "";
  const place = result.journey
    ? `舞台: 『${result.journey.areaName}』（${result.journey.regionLabel}）→ 次は『${result.journey.nextAreaName}』`
    : "";

  return `【バトル結果】${resultLabel}
相手（大ボス）: Lv.${result.bossRank} ${result.bossName}
${place}
${score}
ニュース: ${result.newsPlain}
なぜ: ${result.outcomeWhy}
入手: ${lootBits.join(" ／ ")}
次に見ること: ${result.nextMove}
感想: ${result.impression}`;
}

export function resolveDailyBattle(
  briefing: SolunaNewsBriefing,
  messages: SolunaSystemMessage[],
  hunter: SolunaHunterState,
): { result: SolunaBattleResult; hunter: SolunaHunterState; recap: string } {
  const enriched = enrichBriefingWithMonsters(briefing);
  const boss = pickBoss(enriched);
  const trash = pickTrashMobs(enriched, 2);
  const rank = boss.monster?.rank ?? 2;
  const { heat, depth } = evaluateDebateHeat(messages);

  const area = inferAreaFromBriefing(enriched);
  const nextArea = pickNextDestination(area, enriched);

  const trashEncounters = trash.map((item, index) =>
    resolveEncounter(item, index === 0 ? "trash" : "mid", heat, depth),
  );
  const bossEncounter = resolveEncounter(boss, "boss", heat, depth);
  const encounters = [...trashEncounters, bossEncounter];
  const wins = encounters.filter((row) => row.outcome === "victory").length;
  const losses = encounters.length - wins;
  const goldFlavorTotal = encounters.reduce((sum, row) => sum + row.goldFlavor, 0);
  const xpFromEncounters = encounters.reduce((sum, row) => sum + row.xpGained, 0);

  const outcome = bossEncounter.outcome;
  const medal = medalFor(rank, heat, outcome);
  const item =
    outcome === "victory"
      ? hashPick(ITEM_POOL, `${briefing.id}:${boss.title}`)
      : heat < 0.18
        ? null
        : ESCAPE_ITEM;

  const xpGained = Math.max(
    xpFromEncounters,
    outcome === "victory" ? 12 + rank * 8 : 4 + rank * 2,
  );

  const loot: SolunaBattleLoot = {
    medal,
    itemName: item?.name ?? null,
    itemFlavor: item?.flavor ?? null,
    xpGained,
  };

  const progressed = withLevelProgress({
    ...hunter,
    xp: hunter.xp + xpGained,
    medals: {
      ...hunter.medals,
      ...(medal ? { [medal]: hunter.medals[medal] + 1 } : {}),
    },
    currentAreaId: area.id,
    updatedAt: new Date().toISOString(),
  });

  const inventoryItem: SolunaHunterInventoryItem | null = item
    ? {
        id: `loot-${randomUUID()}`,
        name: item.name,
        flavor: item.flavor,
        acquiredAt: new Date().toISOString(),
        briefingId: briefing.id,
      }
    : null;

  const inventory = inventoryItem
    ? [...progressed.inventory, inventoryItem].slice(-24)
    : progressed.inventory;

  const positiveSpin =
    outcome === "escape" && wins > 0
      ? `大ボスには逃げられたが、小物戦 ${wins} 勝で経験値と物語ゴールドを確保。旅は続く。`
      : undefined;

  const result: SolunaBattleResult = {
    id: `battle-${randomUUID()}`,
    briefingId: briefing.id,
    createdAt: new Date().toISOString(),
    outcome,
    heat: Number(heat.toFixed(2)),
    depth: Number(depth.toFixed(2)),
    bossName: boss.monster?.name ?? boss.title,
    bossRank: rank as SolunaBattleResult["bossRank"],
    newsTitle: boss.title,
    newsPlain: boss.summary,
    outcomeWhy: positiveSpin ?? buildOutcomeWhy(outcome, heat, depth),
    impression: buildImpression(outcome, heat, depth, messages),
    nextMove: buildNextMove(enriched, outcome),
    loot,
    levelAfter: progressed.level,
    xpAfter: hunter.xp + xpGained,
    encounters,
    wins,
    losses,
    goldFlavorTotal,
    journey: {
      areaId: area.id,
      areaName: area.name,
      regionLabel: area.regionLabel,
      nextAreaId: nextArea.id,
      nextAreaName: nextArea.name,
    },
  };

  const nextHunter: SolunaHunterState = {
    ...progressed,
    inventory,
    battles: [...progressed.battles, result].slice(-14),
    currentAreaId: nextArea.id,
  };

  void getAreaById(nextHunter.currentAreaId);

  return { result, hunter: nextHunter, recap: formatRecap(result) };
}
