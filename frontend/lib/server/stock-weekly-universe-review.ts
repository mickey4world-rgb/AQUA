/**
 * 週末 JP ユニバース見直し（自動シード相当）。
 * Yahoo で採点 → ウォッチ create/activate/deactivate/park → レビューを Cosmos に保存。
 */
import YahooFinance from "yahoo-finance2";
import { COSMOS_CONTAINERS, getContainer } from "@/lib/server/cosmos";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import {
  createStockWatch,
  listStockWatches,
  updateStockWatch,
} from "@/lib/server/stock-watches";
import { STOCK_JP_UNIVERSE, stockJpUniverseByCode } from "@/lib/stock-jp-universe";
import { scoreStockNewsAffinity } from "@/lib/stock-news-affinity";
import {
  STOCK_HARD_TAKE_PROFIT_MULT,
  STOCK_WEEKLY_MAX_ROTATIONS,
  STOCK_WEEKLY_TARGET_ACTIVE_JP,
} from "@/lib/stock-trade-constants";
import {
  jstWeekId,
  planWeeklyRotation,
  scoreTakeProfitEase,
  type WeeklyRotationPlan,
  type WeeklyScoreResult,
} from "@/lib/stock-weekly-rotation";
import { getLatestWorksNewsDigest } from "@/lib/server/works-news-search-store";
import { displayTicker } from "@/lib/stock-utils";
import type { StockWatch } from "@/lib/types/stock";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export type StockWeeklyUniverseReview = {
  id: string;
  docType: "stockWeeklyUniverseReview";
  userId: string;
  weekId: string;
  applied: boolean;
  dryRun: boolean;
  summary: string;
  desiredActiveCodes: string[];
  newsDigestId?: string | null;
  newsDigestFetchedAt?: string | null;
  scores: Array<{
    code: string;
    name: string;
    price: number;
    score: number;
    affordable: boolean;
    lotYen: number;
    tpYenAtTarget: number;
    changePct: number;
    newsFitBonus: number;
    reasons: string[];
  }>;
  actions: WeeklyRotationPlan["actions"];
  appliedActions: Array<{
    type: string;
    code: string;
    ok: boolean;
    detail?: string;
  }>;
  createdAt: string;
};

function reviewId(userId: string, weekId: string): string {
  return `weeklyUniverseReview:${userId}:${weekId}`;
}

function brokerContainer() {
  return getContainer(COSMOS_CONTAINERS.stockBroker);
}

function codeOf(ticker: string): string {
  return displayTicker(ticker, "jp");
}

async function quoteRow(code: string): Promise<{
  price: number;
  changePct: number;
  avgVolume: number | null;
  name: string;
} | null> {
  try {
    const q = await yahooFinance.quote(`${code}.T`);
    const price = Number(q.regularMarketPrice ?? q.regularMarketPreviousClose);
    const changePct = Number(q.regularMarketChangePercent ?? 0);
    const avgVolume = Number(q.averageDailyVolume3Month ?? q.regularMarketVolume);
    if (!(price > 0)) return null;
    return {
      price,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      avgVolume: Number.isFinite(avgVolume) && avgVolume > 0 ? avgVolume : null,
      name: String(q.shortName || q.displayName || code),
    };
  } catch {
    return null;
  }
}

export async function getLatestWeeklyUniverseReview(
  userId: string,
): Promise<StockWeeklyUniverseReview | null> {
  try {
    const { resources } = await (await brokerContainer()).items
      .query<StockWeeklyUniverseReview>({
        query: `SELECT TOP 1 * FROM c WHERE c.userId = @userId AND c.docType = @docType ORDER BY c.createdAt DESC`,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@docType", value: "stockWeeklyUniverseReview" },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

async function getReviewByWeek(
  userId: string,
  weekId: string,
): Promise<StockWeeklyUniverseReview | null> {
  try {
    const { resource } = await (await brokerContainer())
      .item(reviewId(userId, weekId), userId)
      .read<StockWeeklyUniverseReview>();
    return resource ?? null;
  } catch {
    return null;
  }
}

async function saveReview(doc: StockWeeklyUniverseReview): Promise<void> {
  await (await brokerContainer()).items.upsert(doc);
}

function memoFor(score: WeeklyScoreResult, active: boolean): string {
  const head = active
    ? "週次自動シード・アクティブ"
    : "週次自動シード・監視メモ";
  return `${head} · スコア${score.score} · ${score.reasons.slice(0, 2).join(" / ")}`;
}

async function applyAction(
  userId: string,
  action: WeeklyRotationPlan["actions"][number],
  scoreByCode: Map<string, WeeklyScoreResult>,
  watchesByCode: Map<string, StockWatch>,
): Promise<{ type: string; code: string; ok: boolean; detail?: string }> {
  const score = scoreByCode.get(action.code);
  const existing = watchesByCode.get(action.code);

  try {
    if (action.type === "keep") {
      return { type: action.type, code: action.code, ok: true };
    }

    if (action.type === "create" || action.type === "park") {
      if (existing) {
        return {
          type: action.type,
          code: action.code,
          ok: true,
          detail: "already exists",
        };
      }
      if (!score || !(score.price > 0)) {
        return {
          type: action.type,
          code: action.code,
          ok: false,
          detail: "no quote",
        };
      }
      const active = action.type === "create";
      const watch = await createStockWatch(userId, {
        ticker: action.code,
        market: "jp",
        name: score.name,
        buyPrice: score.price,
        shares: 0,
        targetMultiplier: STOCK_HARD_TAKE_PROFIT_MULT,
        memo: memoFor(score, active),
      });
      if (!active) {
        await updateStockWatch(userId, watch.id, {
          isActive: false,
          memo: memoFor(score, false),
        });
      }
      watchesByCode.set(action.code, { ...watch, isActive: active });
      return { type: action.type, code: action.code, ok: true };
    }

    if (action.type === "activate") {
      if (!existing) {
        return {
          type: action.type,
          code: action.code,
          ok: false,
          detail: "missing watch",
        };
      }
      const patch: {
        isActive: boolean;
        buyPrice?: number;
        memo?: string;
      } = { isActive: true };
      if (existing.shares <= 0 && score && score.price > 0) {
        patch.buyPrice = score.price;
        patch.memo = memoFor(score, true);
      }
      await updateStockWatch(userId, existing.id, patch);
      return { type: action.type, code: action.code, ok: true };
    }

    if (action.type === "deactivate") {
      if (!existing) {
        return {
          type: action.type,
          code: action.code,
          ok: false,
          detail: "missing watch",
        };
      }
      if (existing.shares > 0) {
        return {
          type: action.type,
          code: action.code,
          ok: false,
          detail: "held — skip",
        };
      }
      await updateStockWatch(userId, existing.id, {
        isActive: false,
        memo: score ? memoFor(score, false) : existing.memo,
      });
      return { type: action.type, code: action.code, ok: true };
    }

    return { type: "unknown", code: "", ok: false, detail: "unknown" };
  } catch (error) {
    return {
      type: action.type,
      code: action.code,
      ok: false,
      detail: error instanceof Error ? error.message : "failed",
    };
  }
}

export async function runWeeklyUniverseReview(options: {
  userId: string;
  dryRun?: boolean;
  force?: boolean;
  now?: Date;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  review: StockWeeklyUniverseReview;
  plan: WeeklyRotationPlan;
}> {
  const userId = options.userId;
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const now = options.now ?? new Date();
  const weekId = jstWeekId(now);

  const existingReview = await getReviewByWeek(userId, weekId);
  if (existingReview?.applied && !force && !dryRun) {
    return {
      ok: true,
      skipped: true,
      reason: `week ${weekId} already applied`,
      review: existingReview,
      plan: {
        weekId,
        targetActive: STOCK_WEEKLY_TARGET_ACTIVE_JP,
        maxRotations: STOCK_WEEKLY_MAX_ROTATIONS,
        desiredActiveCodes: existingReview.desiredActiveCodes,
        scores: [],
        actions: existingReview.actions,
        summary: existingReview.summary,
      },
    };
  }

  const [watches, snapshot, newsDigest] = await Promise.all([
    listStockWatches(userId),
    getStockBrokerSnapshot(userId),
    getLatestWorksNewsDigest().catch((): NewsSearchDigest | null => null),
  ]);

  const jpWatches = watches.filter((w) => (w.market ?? "us") === "jp");
  const watchesByCode = new Map(
    jpWatches.map((w) => [codeOf(w.ticker), w] as const),
  );
  const holdingQty = new Map<string, number>();
  for (const h of snapshot?.holdings ?? []) {
    holdingQty.set(h.symbol, (holdingQty.get(h.symbol) ?? 0) + (h.qty ?? 0));
  }

  const scoreInputs = [];
  for (const entry of STOCK_JP_UNIVERSE) {
    const quote = await quoteRow(entry.code);
    if (!quote) continue;
    const watch = watchesByCode.get(entry.code);
    const heldShares = Math.max(
      holdingQty.get(entry.code) ?? 0,
      watch?.shares ?? 0,
    );
    const news = scoreStockNewsAffinity({
      code: entry.code,
      name: quote.name || entry.name,
      tags: [...entry.tags],
      digest: newsDigest,
    });
    const newsFitReasons =
      news.bonus > 0
        ? [
            `News Search 適合 +${news.bonus}（${news.matchedCategories.join(",") || "kw"} · hit ${news.hitCount}）`,
            news.topTitles[0] ? `例: ${news.topTitles[0].slice(0, 40)}` : "",
          ]
        : newsDigest
          ? ["News Search 参照済・直接ヒットなし"]
          : ["News Search ダイジェスト未取得"];
    scoreInputs.push(
      scoreTakeProfitEase({
        code: entry.code,
        name: quote.name || entry.name,
        price: quote.price,
        changePct: quote.changePct,
        avgVolume: quote.avgVolume,
        tier: entry.tier,
        heldShares,
        currentlyActive: watch?.isActive === true,
        newsFitBonus: news.bonus,
        newsFitReasons,
      }),
    );
  }

  const existingCodes = new Set(watchesByCode.keys());
  for (const [code, watch] of watchesByCode) {
    if (scoreInputs.some((s) => s.code === code)) continue;
    const quote = await quoteRow(code);
    if (!quote) continue;
    const heldShares = Math.max(
      holdingQty.get(code) ?? 0,
      watch.shares ?? 0,
    );
    const uni = stockJpUniverseByCode(code);
    const news = scoreStockNewsAffinity({
      code,
      name: watch.name || quote.name,
      tags: uni ? [...uni.tags] : [],
      digest: newsDigest,
    });
    scoreInputs.push(
      scoreTakeProfitEase({
        code,
        name: watch.name || quote.name,
        price: quote.price,
        changePct: quote.changePct,
        avgVolume: quote.avgVolume,
        tier: uni?.tier ?? "satellite",
        heldShares,
        currentlyActive: watch.isActive === true,
        newsFitBonus: news.bonus,
        newsFitReasons:
          news.bonus > 0
            ? [`News Search 適合 +${news.bonus}`]
            : undefined,
      }),
    );
  }

  const plan = planWeeklyRotation({
    scores: scoreInputs,
    existingCodes,
    weekId,
  });

  const scoreByCode = new Map(plan.scores.map((s) => [s.code, s]));
  const appliedActions: StockWeeklyUniverseReview["appliedActions"] = [];

  if (!dryRun) {
    for (const action of plan.actions) {
      if (action.type === "keep") {
        appliedActions.push({ type: action.type, code: action.code, ok: true });
        continue;
      }
      const result = await applyAction(
        userId,
        action,
        scoreByCode,
        watchesByCode,
      );
      appliedActions.push(result);
    }
  }

  const review: StockWeeklyUniverseReview = {
    id: reviewId(userId, weekId),
    docType: "stockWeeklyUniverseReview",
    userId,
    weekId,
    applied: !dryRun,
    dryRun,
    summary: [
      plan.summary,
      newsDigest
        ? `News Search ${newsDigest.id}`
        : "News Search 未取得",
    ].join(" · "),
    desiredActiveCodes: plan.desiredActiveCodes,
    newsDigestId: newsDigest?.id ?? null,
    newsDigestFetchedAt: newsDigest?.fetchedAt ?? null,
    scores: plan.scores.map((s) => ({
      code: s.code,
      name: s.name,
      price: s.price,
      score: s.score,
      affordable: s.affordable,
      lotYen: s.lotYen,
      tpYenAtTarget: s.tpYenAtTarget,
      changePct: s.changePct,
      newsFitBonus: s.newsFitBonus,
      reasons: s.reasons,
    })),
    actions: plan.actions,
    appliedActions: dryRun
      ? plan.actions.map((a) => ({
          type: a.type,
          code: a.code,
          ok: true,
          detail: "dry-run",
        }))
      : appliedActions,
    createdAt: new Date().toISOString(),
  };

  // dry-run でも週次ドキュメントは残す（force 再実行用に applied=false）
  // 同一週の再実行を許すため dry-run は別 id にしない — applied フラグでスキップ
  if (!dryRun || force) {
    await saveReview(review);
  } else {
    // dry-run: 保存は最新確認用に upsert（applied=false）
    await saveReview(review);
  }

  return { ok: true, review, plan };
}
