import { randomUUID } from "crypto";
import {
  CONFLICT_MARKERS,
  countMarkers,
  PRAISE_MARKERS,
} from "@/lib/server/soluna-system-config";
import { enrichBriefingWithMonsters, pickBoss } from "@/lib/soluna-monsters";
import type {
  SolunaBattleLoot,
  SolunaBattleOutcome,
  SolunaBattleResult,
  SolunaHunterInventoryItem,
  SolunaHunterState,
  SolunaMedalKind,
  SolunaNewsBriefing,
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

function buildImpression(
  outcome: SolunaBattleOutcome,
  heat: number,
  depth: number,
  messages: SolunaSystemMessage[],
): string {
  const sol = messages.find((message) => message.role === "sol")?.content ?? "";
  const luna = messages.find((message) => message.role === "luna")?.content ?? "";
  const solBite = sol.replace(/\s+/g, " ").slice(0, 42);
  const lunaBite = luna.replace(/\s+/g, " ").slice(0, 42);

  if (outcome === "escape") {
    if (heat < 0.2) {
      return "議論の火がつかず、モンスターは霧の向こうへ逃げた。今日は偵察勝ち、明日が本番だ。";
    }
    return `白熱しきれず取り逃した。ソルは「${solBite}…」、ルーナは「${lunaBite}…」まで迫ったのに。`;
  }

  if (heat >= 0.7 && depth >= 0.55) {
    return `議論が噛み合って急所まで届いた。ソルの攻め「${solBite}…」と、ルーナの守りが一つの物語になった。`;
  }
  if (heat >= 0.5) {
    return "意見がぶつかったおかげで、ニュースの芯が立体になった。読み応えのある一戦。";
  }
  return "息は揃った。もう一声掘れたら完璧だったが、十分に倒しきった。";
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

function formatRecap(result: SolunaBattleResult): string {
  const medalLabel: Record<SolunaMedalKind, string> = {
    bronze: "銅メダル",
    silver: "銀メダル",
    gold: "金メダル",
    rainbow: "虹メダル",
  };
  const outcomeLine =
    result.outcome === "victory"
      ? `討伐成功！ Lv.${result.bossRank} ${result.bossName} を倒した`
      : `取り逃がした… Lv.${result.bossRank} ${result.bossName} は霧へ消えた`;
  const lootBits = [
    result.loot.medal ? medalLabel[result.loot.medal] : null,
    result.loot.itemName,
    `EXP +${result.loot.xpGained}`,
  ].filter(Boolean);

  return `⚔️ ${outcomeLine}
ハンター Lv.${result.levelAfter}（累計 EXP ${result.xpAfter}）
入手: ${lootBits.join(" ／ ")}

感想: ${result.impression}
次の一手: ${result.nextMove}`;
}

export function resolveDailyBattle(
  briefing: SolunaNewsBriefing,
  messages: SolunaSystemMessage[],
  hunter: SolunaHunterState,
): { result: SolunaBattleResult; hunter: SolunaHunterState; recap: string } {
  const enriched = enrichBriefingWithMonsters(briefing);
  const boss = pickBoss(enriched);
  const rank = boss.monster?.rank ?? 2;
  const { heat, depth } = evaluateDebateHeat(messages);
  const outcome = decideOutcome(heat, depth, rank);
  const medal = medalFor(rank, heat, outcome);
  const xpGained =
    outcome === "victory" ? 12 + rank * 8 + Math.round(heat * 18) : 4 + rank * 2;
  const item =
    outcome === "victory"
      ? hashPick(ITEM_POOL, `${briefing.id}:${boss.title}`)
      : heat < 0.18
        ? null
        : ESCAPE_ITEM;

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

  const result: SolunaBattleResult = {
    id: `battle-${randomUUID()}`,
    briefingId: briefing.id,
    createdAt: new Date().toISOString(),
    outcome,
    heat: Number(heat.toFixed(2)),
    depth: Number(depth.toFixed(2)),
    bossName: boss.monster?.name ?? boss.title,
    bossRank: rank,
    impression: buildImpression(outcome, heat, depth, messages),
    nextMove: buildNextMove(enriched, outcome),
    loot,
    levelAfter: progressed.level,
    xpAfter: hunter.xp + xpGained,
  };

  const nextHunter: SolunaHunterState = {
    ...progressed,
    inventory,
    battles: [...progressed.battles, result].slice(-14),
  };

  return { result, hunter: nextHunter, recap: formatRecap(result) };
}
