/**
 * 少額売買専用枠の日次更新（前日までの相場で採点 → Cosmos 保存 → ウォッチ確保）。
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
import {
  STOCK_DAILY_HARVEST_MAX_REPLACEMENTS,
  STOCK_DAILY_HARVEST_MEMO_TAG,
  STOCK_DAILY_HARVEST_SLATE_SIZE,
  STOCK_HARD_TAKE_PROFIT_MULT,
} from "@/lib/stock-trade-constants";
import {
  jstDayId,
  planDailyHarvestSlate,
  scoreDailyHarvestCandidate,
  type DailyHarvestSlatePlan,
} from "@/lib/stock-daily-harvest-slate";
import { displayTicker } from "@/lib/stock-utils";
import type { StockWatch } from "@/lib/types/stock";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export type StockDailyHarvestSlateDoc = {
  id: string;
  docType: "stockDailyHarvestSlate";
  userId: string;
  dayId: string;
  codes: string[];
  kept: string[];
  added: string[];
  removed: string[];
  summary: string;
  scores: Array<{
    code: string;
    name: string;
    price: number;
    changePct: number;
    score: number;
    yenAt1pct: number;
    reasons: string[];
  }>;
  applied: boolean;
  dryRun: boolean;
  createdAt: string;
};

function brokerContainer() {
  return getContainer(COSMOS_CONTAINERS.stockBroker);
}

function slateId(userId: string, dayId: string): string {
  return `dailyHarvestSlate:${userId}:${dayId}`;
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

export async function getLatestDailyHarvestSlate(
  userId: string,
): Promise<StockDailyHarvestSlateDoc | null> {
  try {
    const { resources } = await (await brokerContainer()).items
      .query<StockDailyHarvestSlateDoc>({
        query: `SELECT TOP 1 * FROM c WHERE c.userId = @userId AND c.docType = @docType ORDER BY c.dayId DESC`,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@docType", value: "stockDailyHarvestSlate" },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

export async function getDailyHarvestSlateByDay(
  userId: string,
  dayId: string,
): Promise<StockDailyHarvestSlateDoc | null> {
  try {
    const { resource } = await (await brokerContainer())
      .item(slateId(userId, dayId), userId)
      .read<StockDailyHarvestSlateDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

async function saveSlate(doc: StockDailyHarvestSlateDoc): Promise<void> {
  await (await brokerContainer()).items.upsert(doc);
}

function harvestMemo(scoreLine: string): string {
  return `${STOCK_DAILY_HARVEST_MEMO_TAG} ${scoreLine}`.slice(0, 240);
}

async function ensureHarvestWatch(
  userId: string,
  code: string,
  name: string,
  price: number,
  scoreLine: string,
  watchesByCode: Map<string, StockWatch>,
): Promise<{ ok: boolean; detail?: string }> {
  const existing = watchesByCode.get(code);
  const memo = harvestMemo(scoreLine);
  try {
    if (existing) {
      // 既存は memo だけ更新（週次アクティブを落とさない）
      if (!(existing.memo ?? "").includes(STOCK_DAILY_HARVEST_MEMO_TAG)) {
        await updateStockWatch(userId, existing.id, {
          memo: `${memo}${existing.memo ? ` / ${existing.memo}` : ""}`.slice(0, 240),
        });
      } else {
        await updateStockWatch(userId, existing.id, { memo });
      }
      return { ok: true, detail: "memo-updated" };
    }
    if (!(price > 0)) return { ok: false, detail: "no price" };
    await createStockWatch(userId, {
      ticker: code,
      market: "jp",
      name,
      buyPrice: price,
      shares: 0,
      targetMultiplier: STOCK_HARD_TAKE_PROFIT_MULT,
      memo,
    });
    // 新規は監視メモ（週次本隊の件数を圧迫しない）。買い Path の challenger として乗る。
    const created = (await listStockWatches(userId)).find(
      (w) => codeOf(w.ticker) === code,
    );
    if (created?.isActive) {
      await updateStockWatch(userId, created.id, { isActive: false });
    }
    return { ok: true, detail: "created-memo" };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runDailyHarvestSlate(input: {
  userId: string;
  dryRun?: boolean;
  force?: boolean;
  now?: Date;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  plan: DailyHarvestSlatePlan | null;
  doc: StockDailyHarvestSlateDoc | null;
}> {
  const now = input.now ?? new Date();
  const dayId = jstDayId(now);
  const existingToday = await getDailyHarvestSlateByDay(input.userId, dayId);
  if (existingToday && !input.force && !input.dryRun) {
    return {
      ok: true,
      skipped: true,
      reason: "本日分は作成済み",
      plan: null,
      doc: existingToday,
    };
  }

  const previous = await getLatestDailyHarvestSlate(input.userId);
  const previousCodes =
    previous && previous.dayId !== dayId ? previous.codes : previous?.codes ?? [];

  const snapshot = await getStockBrokerSnapshot(input.userId).catch(() => null);
  const heldByCode = new Map<string, number>();
  for (const h of snapshot?.holdings ?? []) {
    heldByCode.set(h.symbol, (heldByCode.get(h.symbol) ?? 0) + h.qty);
  }

  const watches = await listStockWatches(input.userId);
  const watchesByCode = new Map<string, StockWatch>();
  for (const w of watches.filter((x) => x.market === "jp")) {
    watchesByCode.set(codeOf(w.ticker), w);
  }

  const codes = new Set<string>([
    ...STOCK_JP_UNIVERSE.map((e) => e.code),
    ...watchesByCode.keys(),
  ]);

  const scored = [];
  for (const code of codes) {
    const quote = await quoteRow(code);
    if (!quote) continue;
    const entry = stockJpUniverseByCode(code);
    scored.push(
      scoreDailyHarvestCandidate({
        code,
        name: entry?.name ?? quote.name,
        price: quote.price,
        changePct: quote.changePct,
        avgVolume: quote.avgVolume,
        tier: entry?.tier ?? "satellite",
        heldShares: heldByCode.get(code) ?? 0,
        wasOnSlate: previousCodes.includes(code),
      }),
    );
  }

  const plan = planDailyHarvestSlate({
    scores: scored,
    previousCodes,
    dayId,
    size: STOCK_DAILY_HARVEST_SLATE_SIZE,
    maxReplacements: STOCK_DAILY_HARVEST_MAX_REPLACEMENTS,
  });

  const doc: StockDailyHarvestSlateDoc = {
    id: slateId(input.userId, dayId),
    docType: "stockDailyHarvestSlate",
    userId: input.userId,
    dayId,
    codes: plan.codes,
    kept: plan.kept,
    added: plan.added,
    removed: plan.removed,
    summary: plan.summary,
    scores: plan.scores.slice(0, 30).map((s) => ({
      code: s.code,
      name: s.name,
      price: s.price,
      changePct: s.changePct,
      score: s.score,
      yenAt1pct: s.yenAt1pct,
      reasons: s.reasons.slice(0, 4),
    })),
    applied: false,
    dryRun: Boolean(input.dryRun),
    createdAt: new Date().toISOString(),
  };

  if (input.dryRun) {
    return { ok: true, plan, doc };
  }

  const scoreByCode = new Map(plan.scores.map((s) => [s.code, s]));
  for (const code of plan.codes) {
    const s = scoreByCode.get(code);
    await ensureHarvestWatch(
      input.userId,
      code,
      s?.name ?? code,
      s?.price ?? 0,
      `スコア${s?.score ?? "?"} · ${(s?.reasons ?? []).slice(0, 2).join(" / ")}`,
      watchesByCode,
    );
  }

  doc.applied = true;
  await saveSlate(doc);
  return { ok: true, plan, doc };
}
