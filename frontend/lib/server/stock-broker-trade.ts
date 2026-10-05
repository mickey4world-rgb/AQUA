import { createHash, randomUUID } from "crypto";
import { COSMOS_CONTAINERS } from "@/lib/server/cosmos";
import { CosmosClient, type Container } from "@azure/cosmos";
import { analyzeStock } from "@/lib/server/stock-analysis";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { getStockMarketRegime } from "@/lib/server/stock-market-regime";
import { listStockWatches } from "@/lib/server/stock-watches";
import { getLatestWorksNewsDigest } from "@/lib/server/works-news-search-store";
import { scoreStockNewsAffinity } from "@/lib/stock-news-affinity";
import { stockJpUniverseByCode } from "@/lib/stock-jp-universe";
import { displayTicker } from "@/lib/stock-utils";
import {
  STOCK_DAILY_MAX_LOSS_YEN,
  STOCK_LOT_SIZE,
  STOCK_MAX_ACTIVE_JP_WATCHES,
  STOCK_MAX_DAILY_BUY_YEN,
  STOCK_MAX_MEMO_CHALLENGER_WATCHES,
  maxDipBuysForWatchCount,
  STOCK_MAX_POSITION_PCT_OF_PRINCIPAL,
  STOCK_MAX_QTY_PER_ORDER,
  STOCK_MAX_SINGLE_ASSET_RATIO,
  STOCK_MAX_TRADE_YEN,
  STOCK_MIN_CASH_RATIO,
  STOCK_PRINCIPAL_YEN,
  STOCK_SESSION_CLOSE_BLACKOUT_MIN,
  STOCK_SESSION_OPEN_BLACKOUT_MIN,
  STOCK_SMALL_DIP_ALLOW_ONE_LOT,
  STOCK_SMALL_INVEST_CASH_FLOOR_YEN,
  STOCK_SMALL_TRADE_YEN,
  STOCK_VOLUME_SPIKE_MULT,
} from "@/lib/stock-trade-constants";
import type { StockAdvice, StockWatch } from "@/lib/types/stock";
import {
  isTrendPathBuyEligible,
  smallInvestBuyCapYen,
} from "@/lib/stock-buy-eligibility";
import {
  isMemoBuyBetterThanActive,
  stockBuySignalPriority,
} from "@/lib/stock-buy-priority";
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
  StockBrokerBuySkip,
  StockBrokerOrderRecord,
  StockBrokerTradeIntent,
  StockBrokerTradePlan,
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
 * buySkips に銘柄ごとの見送り理由を残す（条件見直しのオラクル）。
 */
export async function buildStockBrokerTradeIntents(
  userId: string,
): Promise<StockBrokerTradePlan> {
  const snapshot = await getStockBrokerSnapshot(userId);
  if (!snapshot) return { intents: [], buySkips: [] };

  const allJp = (await listStockWatches(userId)).filter(
    (w) => (w.market ?? "us") === "jp",
  );
  const activeWatches = allJp
    .filter((w) => w.isActive)
    .slice(0, STOCK_MAX_ACTIVE_JP_WATCHES);
  const memoChallengers = allJp
    .filter((w) => !w.isActive)
    .slice(0, STOCK_MAX_MEMO_CHALLENGER_WATCHES);
  // アクティブ優先で分析。監視メモは「好条件なら買い」挑戦枠。
  const watches = [...activeWatches, ...memoChallengers];
  if (watches.length === 0) return { intents: [], buySkips: [] };
  const activeSymbols = new Set(
    activeWatches.map((w) => displayTicker(w.ticker, "jp")),
  );

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
  const newsDigest = await getLatestWorksNewsDigest().catch(() => null);
  const blockNewBuys =
    guardrails.mainBreaker ||
    guardrails.monthlyHalt ||
    dailyLossCircuit ||
    Boolean(regime?.blockBuys);

  const buySkips: StockBrokerBuySkip[] = [];
  const noteBuySkip = (
    symbol: string,
    symbolName: string | undefined,
    reason: string,
    meta?: StockBrokerBuySkip["meta"],
  ) => {
    const existing = buySkips.find((s) => s.symbol === symbol);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    buySkips.push({ symbol, symbolName, reasons: [reason], meta });
  };

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
    return { intents, buySkips };
  }

  // News Search 適合が高い銘柄の買いを先に枠消化する
  const newsFitByCode = new Map<
    string,
    ReturnType<typeof scoreStockNewsAffinity>
  >();
  for (const w of watches) {
    const code = displayTicker(w.ticker, "jp");
    const uni = stockJpUniverseByCode(code);
    newsFitByCode.set(
      code,
      scoreStockNewsAffinity({
        code,
        name: w.name || code,
        tags: uni ? [...uni.tags] : [],
        digest: newsDigest,
      }),
    );
  }
  const watchesOrdered = [...watches].sort((a, b) => {
    const codeA = displayTicker(a.ticker, "jp");
    const codeB = displayTicker(b.ticker, "jp");
    return (
      (newsFitByCode.get(codeB)?.bonus ?? 0) -
      (newsFitByCode.get(codeA)?.bonus ?? 0)
    );
  });

  type Analyzed = {
    watch: StockWatch;
    advice: StockAdvice;
    symbol: string;
    holding: (typeof snapshot.holdings)[number] | undefined;
    price: number;
  };
  const analyzed: Analyzed[] = [];

  for (const watch of watchesOrdered) {
    let advice: StockAdvice;
    try {
      advice = await analyzeStock(watch);
    } catch {
      continue;
    }
    const symbol = displayTicker(watch.ticker, "jp");
    const holding = snapshot.holdings.find((h) => h.symbol === symbol && h.qty > 0);
    const price = advice.currentPrice > 0 ? advice.currentPrice : holding?.price ?? 0;
    analyzed.push({ watch, advice, symbol, holding, price });
  }

  const bestActivePriority = analyzed
    .filter((r) => activeSymbols.has(r.symbol))
    .reduce((max, r) => Math.max(max, stockBuySignalPriority(r.advice)), 0);

  const canBuyRow = (row: Analyzed): { ok: true } | { ok: false; reason: string } => {
    if (activeSymbols.has(row.symbol)) return { ok: true };
    const uni = stockJpUniverseByCode(row.symbol);
    const isCore = uni?.tier === "core";
    const memoPri = stockBuySignalPriority(row.advice);
    // 監視メモ: アクティブ最良より好条件（コアは slack 以内でも可 #45）
    if (
      isMemoBuyBetterThanActive(memoPri, bestActivePriority, { isCore })
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: isCore
        ? `監視メモ・コア(#45): 優先度 ${memoPri} がアクティブ最良 ${bestActivePriority} の slack 外`
        : `監視メモ(#45): 優先度 ${memoPri} ≤ アクティブ最良 ${bestActivePriority}`,
    };
  };

  const tryPushBuy = (input: {
    row: Analyzed;
    mode: "trend" | "dip";
  }): boolean => {
    const { watch, advice, symbol, holding, price } = input.row;
    const name = watch.name || advice.companyName || symbol;
    const meta: StockBrokerBuySkip["meta"] = {
      action: advice.action,
      trend: advice.trend,
      dipBuyEligible: advice.dipBuyEligible ?? false,
      dipScore: advice.dipScore ?? 0,
      rsi14: advice.rsi14 ?? null,
      changePct: advice.changePct,
      mode: input.mode,
      smallInvestMode,
      price,
    };

    if (blockNewBuys) {
      noteBuySkip(
        symbol,
        name,
        regime?.blockReason ??
          (guardrails.mainBreaker
            ? "第3層停止中"
            : guardrails.monthlyHalt
              ? "月次損失停止"
              : dailyLossCircuit
                ? "日次損失サーキット"
                : "新規買い停止中"),
        meta,
      );
      return false;
    }
    const gate = canBuyRow(input.row);
    if (!gate.ok) {
      noteBuySkip(symbol, name, gate.reason, meta);
      return false;
    }
    const fromMemo = !activeSymbols.has(symbol);
    if (!(price > 0)) {
      noteBuySkip(symbol, name, "価格取得できず", meta);
      return false;
    }
    if (avoidChaseBuys && advice.changePct > 3) {
      noteBuySkip(symbol, name, "追撃抑制: 前日比+3%超", meta);
      return false;
    }
    if (
      (advice.volumeSpikeRatio ?? 0) >= STOCK_VOLUME_SPIKE_MULT &&
      advice.changePct < -1
    ) {
      noteBuySkip(
        symbol,
        name,
        `出来高スパイク×${(advice.volumeSpikeRatio ?? 0).toFixed(1)}かつ下落で見送り`,
        meta,
      );
      return false;
    }

    const oneLot = price * STOCK_LOT_SIZE;
    if (remainingDailyBuy < oneLot) {
      noteBuySkip(symbol, name, `日次買付枠不足（残り${Math.floor(remainingDailyBuy)}円 < 1単元${Math.floor(oneLot)}円）`, meta);
      return false;
    }
    if (remainingCash < oneLot) {
      noteBuySkip(symbol, name, `余力不足（現金枠${Math.floor(remainingCash)}円 < 1単元${Math.floor(oneLot)}円）`, meta);
      return false;
    }

    // smallInvest でないときは perTradeCap(=MAX)、dip 少額は1単元まで引き上げ(#46)
    const modeCap = smallInvestBuyCapYen({
      smallInvestMode,
      mode: input.mode,
      price,
      smallTradeYen: STOCK_SMALL_TRADE_YEN,
      lotSize: STOCK_LOT_SIZE,
      allowDipOneLot: STOCK_SMALL_DIP_ALLOW_ONE_LOT,
    });
    const effectivePerTrade = smallInvestMode ? modeCap : perTradeCap;

    const principalCap = STOCK_PRINCIPAL_YEN * STOCK_MAX_POSITION_PCT_OF_PRINCIPAL;
    const budget = Math.min(
      effectivePerTrade,
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
    if (qty < STOCK_LOT_SIZE) {
      noteBuySkip(
        symbol,
        name,
        input.mode === "dip" && smallInvestMode
          ? `単元不足: 予算${Math.floor(budget)}円では1単元(${Math.floor(oneLot)}円)未満（少額モードでも1単元不可）`
          : `単元不足: 予算${Math.floor(budget)}円 / 株価${price} → qty=0`,
        meta,
      );
      return false;
    }

    let notional = qty * price;
    if (notional > budget) {
      qty = roundDownToLot(budget / price);
      notional = qty * price;
    }
    if (qty < STOCK_LOT_SIZE) {
      noteBuySkip(symbol, name, `予算キャップ後に1単元未満（予算${Math.floor(budget)}円）`, meta);
      return false;
    }
    if (notional > STOCK_PRINCIPAL_YEN * 0.7) {
      noteBuySkip(symbol, name, "元本70%超の建玉のため見送り(#22)", meta);
      return false;
    }

    const singleCap = Math.min(
      portfolioApprox * STOCK_MAX_SINGLE_ASSET_RATIO,
      principalCap,
    );
    const existingValue = (holding?.qty ?? 0) * price;
    if (existingValue + qty * price > singleCap && singleCap > 0) {
      const room = Math.max(0, singleCap - existingValue);
      qty = roundDownToLot(room / price);
    }
    if (qty < STOCK_LOT_SIZE) {
      noteBuySkip(symbol, name, "単一銘柄上限(#6)で1単元未満", meta);
      return false;
    }

    const finalNotional = qty * price;
    remainingCash -= finalNotional;
    remainingDailyBuy -= finalNotional;

    const uni = stockJpUniverseByCode(symbol);
    const newsFit =
      newsFitByCode.get(symbol) ??
      scoreStockNewsAffinity({
        code: symbol,
        name: watch.name || advice.companyName || symbol,
        tags: uni ? [...uni.tags] : [],
        digest: newsDigest,
      });

    const ruleIds =
      input.mode === "dip"
        ? [1, 2, 3, 5, 6, 9, 10, 15, 19, 20, 22, 23, 27, 29, 39, 44]
        : [1, 2, 3, 5, 6, 8, 9, 10, 15, 19, 20, 22, 23, 27, 29, 39];
    if (fromMemo) ruleIds.push(45);
    if (smallInvestMode) ruleIds.push(21);
    if (avoidChaseBuys) ruleIds.push(24);
    if ((advice.rsi14 ?? 50) <= 30) ruleIds.push(28);
    if (guardrails.monthlyHalt) ruleIds.push(40);
    if (newsFit.bonus > 0) ruleIds.push(43);
    if (
      input.mode === "dip" &&
      smallInvestMode &&
      STOCK_SMALL_DIP_ALLOW_ONE_LOT &&
      finalNotional > STOCK_SMALL_TRADE_YEN
    ) {
      ruleIds.push(46);
    }

    const newsNote =
      newsFit.bonus > 0
        ? ` / News適合+${newsFit.bonus}`
        : newsDigest
          ? " / News参照・直接ヒットなし"
          : "";
    const dipNote =
      input.mode === "dip"
        ? ` / 安値ゾーン score=${advice.dipScore ?? 0}` +
          (advice.nearMonthLow ? " 月安値" : "") +
          (advice.nearWeekLow ? " 週安値" : "")
        : "";
    const memoNote = fromMemo
      ? ` / 監視メモ挑戦(#45) 優先度${stockBuySignalPriority(advice)} vs 最良${bestActivePriority}`
      : "";
    const smallDipNote =
      input.mode === "dip" &&
      smallInvestMode &&
      finalNotional > STOCK_SMALL_TRADE_YEN
        ? " / 少額でも1単元許可(#46)"
        : "";

    const trendLabel =
      advice.trend === "bullish"
        ? `AI買い + 強気(#8)`
        : `AI買い + 押し目(#8部分解禁)`;

    intents.push({
      id: intentIdFor(userId, symbol, "buy", day),
      userId,
      side: "buy",
      symbol,
      watchTicker: watch.ticker,
      symbolName: name,
      exchange: holding?.exchange || 1,
      qty,
      frontOrderType: 10,
      reason:
        input.mode === "dip"
          ? `安値ゾーン買い(#44): ${advice.summary.slice(0, 100)}${dipNote}${smallDipNote}${memoNote}${newsNote}`
          : smallInvestMode
            ? `少額投資モード(現金<${STOCK_SMALL_INVEST_CASH_FLOOR_YEN}): ${advice.summary.slice(0, 100)}${memoNote}${newsNote}`
            : `${trendLabel}: ${advice.summary.slice(0, 120)}${memoNote}${newsNote}`,
      ruleIds,
      watchId: watch.id,
      adviceAction: advice.action,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
    return true;
  };

  const boughtSymbols = new Set<string>();

  for (const row of analyzed) {
    const { watch, advice, symbol, holding, price } = row;

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

    // --- 買い Path A: #8（buy+強気、または下降+売られすぎ+安値の部分解禁）---
    if (isTrendPathBuyEligible(advice) && price > 0) {
      if (tryPushBuy({ row, mode: "trend" })) {
        boughtSymbols.add(symbol);
      }
    } else if (
      // 買い期待がありそうなときだけ見送り理由を残す（全銘柄ログはノイズ）
      advice.action === "buy" ||
      advice.nearWeekLow ||
      advice.nearMonthLow
    ) {
      if (!advice.dipBuyEligible) {
        noteBuySkip(
          symbol,
          watch.name || advice.companyName || symbol,
          `Path A 非該当: action=${advice.action} trend=${advice.trend} / 安値ゾーン非該当`,
          {
            action: advice.action,
            trend: advice.trend,
            dipBuyEligible: false,
            dipScore: advice.dipScore ?? 0,
            rsi14: advice.rsi14 ?? null,
          },
        );
      }
      // dipBuyEligible なら Path B で再評価（枠切れはそこで記録）
    }
  }

  // --- 買い Path B: 安値ゾーン（週次/月次）。従来未約定の中からスコア順 ---
  // 候補が多い日は枠を約75%に拡大。監視メモは #45（コアは slack 緩和）。
  if (!blockNewBuys) {
    const watchBase =
      activeWatches.length > 0 ? activeWatches.length : analyzed.length;
    const dipEligibleRows = analyzed.filter(
      (row) =>
        !boughtSymbols.has(row.symbol) &&
        row.advice.dipBuyEligible === true &&
        (row.advice.dipScore ?? 0) > 0 &&
        row.price > 0,
    );
    const dipSlotCap = maxDipBuysForWatchCount(
      watchBase,
      dipEligibleRows.length,
    );
    const dipSorted = [...dipEligibleRows].sort(
      (a, b) =>
        (b.advice.dipScore ?? 0) - (a.advice.dipScore ?? 0) ||
        (newsFitByCode.get(b.symbol)?.bonus ?? 0) -
          (newsFitByCode.get(a.symbol)?.bonus ?? 0),
    );
    const dipCandidates = dipSorted.slice(0, dipSlotCap);
    const dipDropped = dipSorted.slice(dipSlotCap);

    for (const row of dipDropped) {
      noteBuySkip(
        row.symbol,
        row.watch.name || row.advice.companyName || row.symbol,
        `安値枠外(#44): 候補${dipEligibleRows.length}・枠${dipSlotCap}・score=${row.advice.dipScore ?? 0}で順位外`,
        {
          dipScore: row.advice.dipScore ?? 0,
          dipSlotCap,
          eligibleCount: dipEligibleRows.length,
        },
      );
    }

    for (const row of dipCandidates) {
      if (tryPushBuy({ row, mode: "dip" })) {
        boughtSymbols.add(row.symbol);
      }
    }
  } else {
    for (const row of analyzed) {
      if (row.advice.dipBuyEligible) {
        noteBuySkip(
          row.symbol,
          row.watch.name || row.advice.companyName || row.symbol,
          regime?.blockReason ?? "新規買い停止中のため安値枠も見送り",
          { dipBuyEligible: true, dipScore: row.advice.dipScore ?? 0 },
        );
      }
    }
  }

  return { intents, buySkips };
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
