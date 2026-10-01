import { createHash, randomUUID } from "crypto";
import { COSMOS_CONTAINERS } from "@/lib/server/cosmos";
import { CosmosClient, type Container } from "@azure/cosmos";
import { analyzeStock } from "@/lib/server/stock-analysis";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { getStockMarketRegime } from "@/lib/server/stock-market-regime";
import { listStockWatches } from "@/lib/server/stock-watches";
import { displayTicker } from "@/lib/stock-utils";
import {
  STOCK_DAILY_MAX_LOSS_YEN,
  STOCK_LOT_SIZE,
  STOCK_MAX_ACTIVE_JP_WATCHES,
  STOCK_MAX_DAILY_BUY_YEN,
  STOCK_MAX_POSITION_PCT_OF_PRINCIPAL,
  STOCK_MAX_QTY_PER_ORDER,
  STOCK_MAX_SINGLE_ASSET_RATIO,
  STOCK_MAX_TRADE_YEN,
  STOCK_MIN_CASH_RATIO,
  STOCK_PRINCIPAL_YEN,
  STOCK_SESSION_CLOSE_BLACKOUT_MIN,
  STOCK_SESSION_OPEN_BLACKOUT_MIN,
  STOCK_SMALL_INVEST_CASH_FLOOR_YEN,
  STOCK_SMALL_TRADE_YEN,
  STOCK_VOLUME_SPIKE_MULT,
} from "@/lib/stock-trade-constants";
import {
  evaluateStockGuardrails,
  isPerTradeLossBreached,
  maxNotionalForPerTradeLoss,
} from "@/lib/stock-guardrails";
import {
  engageStockTradingHalt,
  getStockTradeLessonBias,
  getStockTradingHalt,
} from "@/lib/server/stock-trade-lessons";
import type {
  StockBrokerOrderRecord,
  StockBrokerTradeIntent,
} from "@/lib/types/stock-broker-trade";

let ordersContainerCache: Container | null = null;

async function ordersContainer(): Promise<Container> {
  if (ordersContainerCache) return ordersContainerCache;
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be configured");
  }
  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({
    id: databaseId,
  });
  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_CONTAINERS.stockBrokerOrders,
    partitionKey: { paths: ["/userId"] },
  });
  ordersContainerCache = container;
  return container;
}

function intentIdFor(userId: string, symbol: string, side: string, dayJst: string) {
  const raw = `${userId}:${side}:${symbol}:${dayJst}`;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `intent-${hash}`;
}

function jstDayId(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function roundDownToLot(qty: number): number {
  if (qty < STOCK_LOT_SIZE) return 0;
  return Math.floor(qty / STOCK_LOT_SIZE) * STOCK_LOT_SIZE;
}

function jstMinsOfDay(now = new Date()): { weekday: string; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, mins: hour * 60 + minute };
}

/**
 * 東証の粗い取引可能時間。
 * 寄り付き直後・大引け間際のブラックアウトを除外（#30）。
 * 祝日は未考慮 — bridge 側でも再チェック。
 */
export function isRoughJpEquitySession(now = new Date()): boolean {
  const { weekday, mins } = jstMinsOfDay(now);
  if (weekday === "Sat" || weekday === "Sun") return false;

  const open = 9 * 60;
  const amEnd = 11 * 60 + 30;
  const pmStart = 12 * 60 + 30;
  const close = 15 * 60;
  const openOk =
    mins >= open + STOCK_SESSION_OPEN_BLACKOUT_MIN && mins <= amEnd;
  const pmOk =
    mins >= pmStart &&
    mins <= close - STOCK_SESSION_CLOSE_BLACKOUT_MIN;
  return openOk || pmOk;
}

/**
 * Phase C2 検証: 日本株・現物の売り＋買いシミュレーション。
 * LIVE sendorder は bridge 側ゲート。ここはインテント生成のみ。
 */
export async function buildStockBrokerTradeIntents(
  userId: string,
): Promise<StockBrokerTradeIntent[]> {
  const snapshot = await getStockBrokerSnapshot(userId);
  if (!snapshot) return [];

  const watches = (await listStockWatches(userId))
    .filter((w) => w.isActive && (w.market ?? "us") === "jp")
    .slice(0, STOCK_MAX_ACTIVE_JP_WATCHES);
  if (watches.length === 0) return [];

  const day = jstDayId();
  const expiresAt = new Date(Date.now() + 45 * 60_000).toISOString();
  const intents: StockBrokerTradeIntent[] = [];

  const holdingsValue = snapshot.holdings.reduce(
    (sum, h) => sum + Math.max(0, h.qty) * Math.max(0, h.price),
    0,
  );
  const cash = Math.max(0, snapshot.cash.stockAccountWallet);
  const portfolioApprox = cash + holdingsValue;
  const minCashKeep = cash * STOCK_MIN_CASH_RATIO;

  const recentOrders = await listRecentBrokerOrders(userId, 200).catch(() => []);
  const todayBuyYen = recentOrders
    .filter((o) => {
      if (o.side !== "buy") return false;
      if (o.status !== "dry_run" && o.status !== "submitted") return false;
      return jstDayId(new Date(o.createdAt)) === day;
    })
    .reduce((sum, o) => {
      const px =
        snapshot.holdings.find((h) => h.symbol === o.symbol)?.price ?? 0;
      return sum + (px > 0 ? o.qty * px : o.qty * 1000);
    }, 0);

  const todayRealizedLossYen = recentOrders
    .filter((o) => {
      if (o.side !== "sell") return false;
      if (o.status !== "dry_run" && o.status !== "submitted") return false;
      if (jstDayId(new Date(o.createdAt)) !== day) return false;
      return (o.realizedPnlYen ?? 0) < 0;
    })
    .reduce((sum, o) => sum + Math.abs(Number(o.realizedPnlYen) || 0), 0);

  const dailyLossCircuit =
    todayRealizedLossYen >= STOCK_DAILY_MAX_LOSS_YEN;

  const haltState = await getStockTradingHalt(userId).catch(() => ({
    halted: false,
  }));
  const guardrails = evaluateStockGuardrails({
    orders: recentOrders,
    tradingHalted: haltState.halted,
  });

  // 第3層: 通算損失到達 → 権限停止を永続化し、保有は全決済インテントへ
  if (guardrails.mainBreaker && !haltState.halted) {
    await engageStockTradingHalt(
      userId,
      guardrails.notes.find((n) => n.includes("第3層")) ??
        "通算最大許容損失に到達",
    ).catch(() => undefined);
  }

  let remainingDailyBuy = Math.max(0, STOCK_MAX_DAILY_BUY_YEN - todayBuyYen);
  let remainingCash = Math.max(0, cash - minCashKeep);

  const smallInvestMode = cash < STOCK_SMALL_INVEST_CASH_FLOOR_YEN;
  const perTradeCap = smallInvestMode ? STOCK_SMALL_TRADE_YEN : STOCK_MAX_TRADE_YEN;
  const layer1NotionalCap = maxNotionalForPerTradeLoss();

  const lessonBias = await getStockTradeLessonBias(userId).catch(() => null);
  const preferEarlierTakeProfit = Boolean(lessonBias?.preferEarlierTakeProfit);
  const avoidChaseBuys = Boolean(lessonBias?.avoidChaseBuys);

  const regime = await getStockMarketRegime().catch(() => null);
  const blockNewBuys =
    guardrails.mainBreaker ||
    guardrails.monthlyHalt ||
    dailyLossCircuit ||
    Boolean(regime?.blockBuys);

  // 第3層発動中: 分析を待たず保有を全決済（成行相当・frontOrderType 10）
  if (guardrails.mainBreaker) {
    for (const h of snapshot.holdings) {
      if (h.qty < STOCK_LOT_SIZE) continue;
      const qty = Math.min(roundDownToLot(h.qty), STOCK_MAX_QTY_PER_ORDER);
      if (qty < STOCK_LOT_SIZE) continue;
      intents.push({
        id: intentIdFor(userId, h.symbol, "sell", day),
        userId,
        side: "sell",
        symbol: h.symbol,
        symbolName: h.symbolName || h.symbol,
        exchange: h.exchange || 1,
        qty,
        frontOrderType: 10,
        reason: `第3層メインブレーカー: 通算損失上限到達のため全決済 — 累計実現 ${guardrails.cumulativeRealizedPnlYen.toLocaleString("ja-JP")}円`,
        ruleIds: [1, 13, 14, 15, 41],
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    }
    return intents;
  }

  for (const watch of watches) {
    let advice;
    try {
      advice = await analyzeStock(watch);
    } catch {
      continue;
    }

    const symbol = displayTicker(watch.ticker, "jp");
    const holding = snapshot.holdings.find((h) => h.symbol === symbol && h.qty > 0);
    const price = advice.currentPrice > 0 ? advice.currentPrice : holding?.price ?? 0;

    const hardStop =
      holding != null &&
      isPerTradeLossBreached({
        buyPrice: watch.buyPrice > 0 ? watch.buyPrice : advice.buyPrice,
        currentPrice: advice.currentPrice,
        qty: holding.qty,
      });

    // --- 売り ---
    const softSell =
      advice.action === "sell" ||
      hardStop ||
      (preferEarlierTakeProfit &&
        watch.targetPrice > 0 &&
        advice.currentPrice >= watch.targetPrice * 0.95);

    // 月次CB / 日次CB 中は硬損切り以外の売りを止める
    const haltNonStopSells =
      (guardrails.monthlyHalt || dailyLossCircuit) && !hardStop;
    if (softSell && holding && !haltNonStopSells) {
      const hitTarget =
        watch.targetPrice > 0 && advice.currentPrice >= watch.targetPrice;
      const watchQty =
        typeof watch.shares === "number" && watch.shares > 0
          ? watch.shares
          : holding.qty;
      const qty = Math.min(
        holding.qty,
        watchQty,
        STOCK_MAX_QTY_PER_ORDER,
      );
      if (qty > 0) {
        const ruleIds = [
          ...(hitTarget
            ? [1, 11, 12, 13, 14, 15, 19, 20, 23, 26]
            : hardStop
              ? [1, 13, 14, 15, 23, 25, 39]
              : [1, 12, 13, 14, 15, 19, 20, 23]),
        ];
        if (preferEarlierTakeProfit) ruleIds.push(24);
        if (advice.macdCross === "dead") ruleIds.push(28);
        intents.push({
          id: intentIdFor(userId, symbol, "sell", day),
          userId,
          side: "sell",
          symbol,
          watchTicker: watch.ticker,
          symbolName: holding.symbolName || watch.name || advice.companyName,
          exchange: holding.exchange || 1,
          qty,
          frontOrderType: 10,
          reason: hardStop
            ? `第1層/硬損切り: 取得比 ${advice.profitPct.toFixed(1)}% または含み損上限 — ${advice.summary.slice(0, 80)}`
            : hitTarget
              ? `硬利確寄り: 目標到達 + AI売り — ${advice.summary.slice(0, 100)}`
              : `AI売り検討: ${advice.summary.slice(0, 120)}`,
          ruleIds,
          watchId: watch.id,
          adviceAction: advice.action,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
      }
    }

    // --- 買い ---
    if (
      !blockNewBuys &&
      advice.action === "buy" &&
      advice.trend === "bullish" &&
      price > 0
    ) {
      if (avoidChaseBuys && advice.changePct > 3) continue;
      if (
        (advice.volumeSpikeRatio ?? 0) >= STOCK_VOLUME_SPIKE_MULT &&
        advice.changePct < -1
      ) {
        continue;
      }
      if (remainingDailyBuy < price * STOCK_LOT_SIZE) continue;
      if (remainingCash < price * STOCK_LOT_SIZE) continue;

      const principalCap = STOCK_PRINCIPAL_YEN * STOCK_MAX_POSITION_PCT_OF_PRINCIPAL;
      const budget = Math.min(
        perTradeCap,
        remainingDailyBuy,
        remainingCash,
        STOCK_PRINCIPAL_YEN * 0.7,
        principalCap,
        layer1NotionalCap,
      );
      let qty =
        typeof watch.shares === "number" && watch.shares >= STOCK_LOT_SIZE
          ? roundDownToLot(watch.shares)
          : roundDownToLot(budget / price);
      qty = Math.min(qty, STOCK_MAX_QTY_PER_ORDER);
      qty = roundDownToLot(qty);
      if (qty < STOCK_LOT_SIZE) continue;

      let notional = qty * price;
      if (notional > budget) {
        qty = roundDownToLot(budget / price);
        notional = qty * price;
      }
      if (qty < STOCK_LOT_SIZE) continue;
      if (notional > STOCK_PRINCIPAL_YEN * 0.7) continue;

      const singleCap = Math.min(
        portfolioApprox * STOCK_MAX_SINGLE_ASSET_RATIO,
        principalCap,
      );
      const existingValue = (holding?.qty ?? 0) * price;
      if (existingValue + qty * price > singleCap && singleCap > 0) {
        const room = Math.max(0, singleCap - existingValue);
        qty = roundDownToLot(room / price);
      }
      if (qty < STOCK_LOT_SIZE) continue;

      const finalNotional = qty * price;
      remainingCash -= finalNotional;
      remainingDailyBuy -= finalNotional;

      const ruleIds = [1, 2, 3, 5, 6, 8, 9, 10, 15, 19, 20, 22, 23, 27, 29, 39];
      if (smallInvestMode) ruleIds.push(21);
      if (avoidChaseBuys) ruleIds.push(24);
      if ((advice.rsi14 ?? 50) <= 30) ruleIds.push(28);
      if (guardrails.monthlyHalt) ruleIds.push(40);

      intents.push({
        id: intentIdFor(userId, symbol, "buy", day),
        userId,
        side: "buy",
        symbol,
        watchTicker: watch.ticker,
        symbolName: watch.name || advice.companyName || symbol,
        exchange: holding?.exchange || 1,
        qty,
        frontOrderType: 10,
        reason: smallInvestMode
          ? `少額投資モード(現金<${STOCK_SMALL_INVEST_CASH_FLOOR_YEN}): ${advice.summary.slice(0, 100)}`
          : `AI買い + 強気: ${advice.summary.slice(0, 120)}`,
        ruleIds,
        watchId: watch.id,
        adviceAction: advice.action,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    }
  }

  return intents;
}

export async function listRecentBrokerOrders(
  userId: string,
  limit = 20,
): Promise<StockBrokerOrderRecord[]> {
  const { resources } = await (
    await ordersContainer()
  ).items
    .query<StockBrokerOrderRecord>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@limit", value: limit },
      ],
    })
    .fetchAll();
  return resources;
}

export async function recordBrokerOrder(
  input: Omit<StockBrokerOrderRecord, "id" | "createdAt"> & {
    id?: string;
  },
): Promise<StockBrokerOrderRecord> {
  const doc: StockBrokerOrderRecord = {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    intentId: input.intentId,
    side: input.side,
    symbol: input.symbol,
    exchange: input.exchange,
    qty: input.qty,
    status: input.status,
    dryRun: input.dryRun,
    reason: input.reason,
    ruleIds: input.ruleIds,
    realizedPnlYen: input.realizedPnlYen,
    kabuOrderId: input.kabuOrderId,
    kabuResultCode: input.kabuResultCode,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  await (await ordersContainer()).items.upsert(doc);
  return doc;
}

/** 同一 intent がすでに submitted/dry_run なら再発注しない */
export async function wasIntentAlreadyHandled(
  userId: string,
  intentId: string,
): Promise<boolean> {
  const recent = await listRecentBrokerOrders(userId, 80);
  return recent.some(
    (o) =>
      o.intentId === intentId &&
      (o.status === "submitted" || o.status === "dry_run"),
  );
}
