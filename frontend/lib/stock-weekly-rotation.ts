/**
 * 週末ユニバース見直しの純関数（採点・入れ替え計画）。
 * 副作用なし — テストと cron 本体が共有。
 */
import {
  STOCK_HARD_TAKE_PROFIT_MULT,
  STOCK_LOT_SIZE,
  STOCK_MAX_POSITION_PCT_OF_PRINCIPAL,
  STOCK_MAX_TRADE_YEN,
  STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN,
  STOCK_PRINCIPAL_YEN,
  STOCK_WEEKLY_MAX_ROTATIONS,
  STOCK_WEEKLY_OVERHEAT_CHANGE_PCT,
  STOCK_WEEKLY_TARGET_ACTIVE_JP,
} from "@/lib/stock-trade-constants";
import type { StockJpUniverseTier } from "@/lib/stock-jp-universe";

/** コア銘柄は週次 soft ローテで監視メモへ落とさない（単元不可は除く） */
export function isCoreProtectedFromWeeklyDeactivate(
  tier: StockJpUniverseTier,
): boolean {
  return tier === "core";
}

export type WeeklyScoreInput = {
  code: string;
  name: string;
  price: number;
  changePct: number;
  avgVolume?: number | null;
  tier: StockJpUniverseTier;
  /** 保有株数（証券 or ウォッチ）。>0 ならローテアウト禁止 */
  heldShares: number;
  currentlyActive: boolean;
  /** Works News Search 適合ボーナス（0〜30） */
  newsFitBonus?: number;
  newsFitReasons?: string[];
};

export type WeeklyScoreResult = {
  code: string;
  name: string;
  price: number;
  changePct: number;
  lotYen: number;
  tpYenAtTarget: number;
  affordable: boolean;
  score: number;
  reasons: string[];
  tier: StockJpUniverseTier;
  heldShares: number;
  currentlyActive: boolean;
  newsFitBonus: number;
};

export type WeeklyRotationAction =
  | { type: "keep"; code: string; reason: string }
  | { type: "activate"; code: string; reason: string }
  | { type: "create"; code: string; reason: string }
  | { type: "deactivate"; code: string; reason: string }
  | { type: "park"; code: string; reason: string };

export type WeeklyRotationPlan = {
  weekId: string;
  targetActive: number;
  maxRotations: number;
  desiredActiveCodes: string[];
  scores: WeeklyScoreResult[];
  actions: WeeklyRotationAction[];
  summary: string;
};

const TIER_BONUS: Record<StockJpUniverseTier, number> = {
  core: 12,
  "core-mid": 6,
  satellite: 4,
  thin: -18,
  "watch-only": -8,
};

export function jpLotYen(price: number): number {
  return Math.round(price * STOCK_LOT_SIZE);
}

export function isJpLotAffordable(price: number): boolean {
  if (!(price > 0)) return false;
  const lot = jpLotYen(price);
  const maxPos = STOCK_PRINCIPAL_YEN * STOCK_MAX_POSITION_PCT_OF_PRINCIPAL;
  return lot <= STOCK_MAX_TRADE_YEN && lot <= maxPos;
}

/** 硬利確到達時の単元あたり想定利益（円） */
export function jpTpYenAtHardTarget(price: number): number {
  return Math.round(jpLotYen(price) * (STOCK_HARD_TAKE_PROFIT_MULT - 1));
}

/**
 * 利確しやすさスコア（高いほど週末アクティブ候補）。
 * 単元が買えない銘柄は大きく減点し、監視メモ側へ寄せる。
 */
export function scoreTakeProfitEase(input: WeeklyScoreInput): WeeklyScoreResult {
  const price = Number(input.price) || 0;
  const changePct = Number(input.changePct) || 0;
  const lotYen = jpLotYen(price);
  const tpYenAtTarget = jpTpYenAtHardTarget(price);
  const affordable = isJpLotAffordable(price);
  const reasons: string[] = [];
  let score = 0;

  if (!affordable) {
    score -= 100;
    reasons.push(
      `単元 ${lotYen.toLocaleString("ja-JP")}円は買付枠外（監視メモ）`,
    );
  } else {
    score += 40;
    reasons.push(`単元可 ${lotYen.toLocaleString("ja-JP")}円`);
  }

  if (affordable && tpYenAtTarget > 0) {
    const ratio = tpYenAtTarget / STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN;
    const tpScore = Math.min(35, Math.round(ratio * 28));
    score += tpScore;
    reasons.push(
      `硬利確1単元 約 ${tpYenAtTarget.toLocaleString("ja-JP")}円（月次目標比 ${(ratio * 100).toFixed(0)}%）`,
    );

    // 月次目標達成には回転が必要。1回が厚すぎ／薄すぎより、短期で回せる単元を優遇。
    const roundsToMonthly = Math.ceil(
      STOCK_MONTHLY_SELL_PROFIT_TARGET_YEN / tpYenAtTarget,
    );
    if (roundsToMonthly >= 4 && roundsToMonthly <= 15) {
      score += 16;
      reasons.push(
        `月次目標まで概算 ${roundsToMonthly} 回転（短期利確・回数向き）`,
      );
    } else if (roundsToMonthly <= 3) {
      score += 10;
      reasons.push(`1回利が厚め（概算 ${roundsToMonthly} 回転で月次）`);
    } else if (roundsToMonthly <= 25) {
      score += 6;
      reasons.push(`回転多め（概算 ${roundsToMonthly} 回で月次）`);
    }

    const lotsInTradeCap = STOCK_MAX_TRADE_YEN / lotYen;
    if (lotsInTradeCap >= 2) {
      const rotBonus = Math.min(12, Math.round((lotsInTradeCap - 1) * 4));
      score += rotBonus;
      reasons.push(
        `買付枠内で約 ${lotsInTradeCap.toFixed(1)} 単元分の回転余地`,
      );
    }
  }

  const tierBonus = TIER_BONUS[input.tier] ?? 0;
  score += tierBonus;
  if (tierBonus < 0) {
    reasons.push(`枠 ${input.tier}（減点）`);
  } else if (input.tier === "core") {
    reasons.push("コア枠");
  }

  if (changePct >= STOCK_WEEKLY_OVERHEAT_CHANGE_PCT) {
    score -= 20;
    reasons.push(`直近+${changePct.toFixed(1)}%で過熱寄り（追撃抑制）`);
  } else if (changePct <= -5) {
    score += 8;
    reasons.push(`押し目圏 ${changePct.toFixed(1)}%`);
  }

  const vol = input.avgVolume;
  if (typeof vol === "number" && vol > 0) {
    if (vol >= 500_000) {
      score += 8;
      reasons.push("流動性厚め");
    } else if (vol < 50_000) {
      score -= 10;
      reasons.push("出来高低め");
    }
  }

  if (input.heldShares > 0) {
    score += 50;
    reasons.push(`保有 ${input.heldShares}株 — ローテアウト禁止`);
  }

  const newsFitBonus = Math.max(0, Math.round(input.newsFitBonus ?? 0));
  if (newsFitBonus > 0) {
    score += newsFitBonus;
    const detail =
      input.newsFitReasons?.filter(Boolean).slice(0, 2).join(" / ") ||
      `News Search 適合 +${newsFitBonus}`;
    reasons.push(detail);
  }

  return {
    code: input.code,
    name: input.name,
    price,
    changePct,
    lotYen,
    tpYenAtTarget,
    affordable,
    score,
    reasons,
    tier: input.tier,
    heldShares: input.heldShares,
    currentlyActive: input.currentlyActive,
    newsFitBonus,
  };
}

export function jstWeekId(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const asUtcGuess = new Date(`${y}-${m}-${d}T12:00:00+09:00`);
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(asUtcGuess);
  const offsetToSat: Record<string, number> = {
    Sat: 0,
    Sun: -1,
    Mon: 5,
    Tue: 4,
    Wed: 3,
    Thu: 2,
    Fri: 1,
  };
  const delta = offsetToSat[dow] ?? 0;
  const sat = new Date(asUtcGuess.getTime() + delta * 86_400_000);
  const sp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(sat);
  const sy = sp.find((p) => p.type === "year")?.value ?? y;
  const sm = sp.find((p) => p.type === "month")?.value ?? m;
  const sd = sp.find((p) => p.type === "day")?.value ?? d;
  return `${sy}-${sm}-${sd}`;
}

/**
 * スコア上位から目標件数のアクティブ集合を決め、シード充足＋一部入れ替えアクションを作る。
 *
 * - 保有銘柄は常に desired
 * - 未登録の desired は件数制限なく create（自動シード相当）
 * - 目標超過分の deactivate は maxRotations（一部入れ替え）
 * - 単元不可は必ず park / deactivate（保有除く）
 */
export function planWeeklyRotation(args: {
  scores: WeeklyScoreResult[];
  existingCodes: Set<string>;
  targetActive?: number;
  maxRotations?: number;
  weekId?: string;
}): WeeklyRotationPlan {
  const targetActive = args.targetActive ?? STOCK_WEEKLY_TARGET_ACTIVE_JP;
  const maxRotations = args.maxRotations ?? STOCK_WEEKLY_MAX_ROTATIONS;
  const weekId = args.weekId ?? jstWeekId();
  const ranked = [...args.scores].sort((a, b) => b.score - a.score);

  const heldCodes = new Set(
    ranked.filter((s) => s.heldShares > 0).map((s) => s.code),
  );
  // 既にアクティブ／保有の買えるコアは目標超過でも desired 維持（memo 落とし禁止）
  const coreKeepCodes = ranked
    .filter(
      (s) =>
        isCoreProtectedFromWeeklyDeactivate(s.tier) &&
        s.affordable &&
        (s.currentlyActive || s.heldShares > 0),
    )
    .map((s) => s.code);

  const desiredActiveCodes: string[] = [...heldCodes];
  for (const code of coreKeepCodes) {
    if (!desiredActiveCodes.includes(code)) desiredActiveCodes.push(code);
  }
  // 空き枠はコアを先に、その後スコア順
  const fillers = ranked
    .filter((s) => s.affordable && !desiredActiveCodes.includes(s.code))
    .sort((a, b) => {
      const ac = isCoreProtectedFromWeeklyDeactivate(a.tier) ? 1 : 0;
      const bc = isCoreProtectedFromWeeklyDeactivate(b.tier) ? 1 : 0;
      if (bc !== ac) return bc - ac;
      return b.score - a.score;
    });
  for (const s of fillers) {
    if (desiredActiveCodes.length >= targetActive) break;
    desiredActiveCodes.push(s.code);
  }
  const desiredSet = new Set(desiredActiveCodes);

  const actions: WeeklyRotationAction[] = [];
  const toRaise: WeeklyScoreResult[] = [];
  const forcedDown: WeeklyScoreResult[] = [];
  const softExcess: WeeklyScoreResult[] = [];

  for (const s of ranked) {
    const exists = args.existingCodes.has(s.code);
    const inDesired = desiredSet.has(s.code);

    if (inDesired) {
      if (s.currentlyActive) {
        actions.push({
          type: "keep",
          code: s.code,
          reason: s.reasons[0] ?? "継続",
        });
      } else {
        toRaise.push(s);
      }
      continue;
    }

    // desired 外
    if (s.heldShares > 0) {
      actions.push({
        type: "keep",
        code: s.code,
        reason: "保有のため維持",
      });
      continue;
    }

    if (s.currentlyActive) {
      if (!s.affordable) forcedDown.push(s);
      else softExcess.push(s);
      continue;
    }

    if (!exists && !s.affordable) {
      actions.push({
        type: "park",
        code: s.code,
        reason: s.reasons[0] ?? "単元不可・監視メモのみ",
      });
    }
  }

  // 自動シード: desired の欠落はすべて create / activate
  toRaise.sort((a, b) => b.score - a.score);
  for (const s of toRaise) {
    const exists = args.existingCodes.has(s.code);
    actions.push({
      type: exists ? "activate" : "create",
      code: s.code,
      reason: `利確しやすい候補（スコア ${s.score} / 硬利確1単元 ${s.tpYenAtTarget.toLocaleString("ja-JP")}円）`,
    });
  }

  for (const s of forcedDown) {
    actions.push({
      type: "deactivate",
      code: s.code,
      reason: s.reasons[0] ?? "単元不可のため監視メモへ",
    });
  }

  // 一部入れ替え: 目標超過分だけ、スコア低い excess を落とす（上限 maxRotations）
  // コアは soft deactivate しない（#42）。単元不可の forcedDown は従来どおり。
  const softKickable = softExcess.filter(
    (s) => !isCoreProtectedFromWeeklyDeactivate(s.tier),
  );
  for (const s of softExcess) {
    if (isCoreProtectedFromWeeklyDeactivate(s.tier)) {
      actions.push({
        type: "keep",
        code: s.code,
        reason: "コア銘柄は週次 soft ローテで監視メモへ落とさない",
      });
    }
  }
  const currentlyActiveCount = ranked.filter((s) => s.currentlyActive).length;
  const projected =
    currentlyActiveCount - forcedDown.length + toRaise.length;
  const overshoot = Math.max(0, projected - targetActive);
  softKickable.sort((a, b) => a.score - b.score);
  const kicks = Math.min(maxRotations, overshoot, softKickable.length);
  for (let i = 0; i < kicks; i++) {
    const s = softKickable[i]!;
    actions.push({
      type: "deactivate",
      code: s.code,
      reason: `週次ローテ: スコア ${s.score}・利確優先度低下`,
    });
  }

  const createCount = actions.filter((a) => a.type === "create").length;
  const activateCount = actions.filter((a) => a.type === "activate").length;
  const deactivateCount = actions.filter((a) => a.type === "deactivate").length;
  const parkCount = actions.filter((a) => a.type === "park").length;

  const summary = [
    `週次キー ${weekId}`,
    `目標アクティブ ${targetActive}`,
    `希望: ${desiredActiveCodes.join(",") || "なし"}`,
    `create ${createCount} / activate ${activateCount} / deactivate ${deactivateCount} / park ${parkCount}`,
  ].join(" · ");

  return {
    weekId,
    targetActive,
    maxRotations,
    desiredActiveCodes,
    scores: ranked,
    actions,
    summary,
  };
}
