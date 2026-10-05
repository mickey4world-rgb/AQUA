/**
 * 日本株ブローカー注文から、Soluna 約定サマリと同型の日次／時間帯ビューを組み立てる。
 */
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import { STOCK_SESSION_CLOSE_BLACKOUT_MIN, STOCK_SESSION_OPEN_BLACKOUT_MIN } from "@/lib/stock-trade-constants";

/** bridge が見送り時に書く点検レコード */
export const STOCK_IDLE_CHECK_SYMBOL = "_CHECK_";

export type StockActivityDaySummary = {
  date: string;
  label: string;
  /** dry-run + LIVE 提出（点検除く） */
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  buyYen: number;
  sellYen: number;
  realizedPnlYen: number;
  dryRunCount: number;
  liveCount: number;
  checkCount: number;
  symbols: string[];
};

export type StockActivityHourBucket = {
  hour: number;
  label: string;
  tradeCount: number;
  checkCount: number;
  buyYen: number;
  sellYen: number;
  realizedPnlYen: number;
  actions: Array<{
    time: string;
    side: "buy" | "sell" | "check";
    symbol: string;
    qty: number;
    notionalYen: number;
    status: StockBrokerOrderRecord["status"];
    reason: string;
  }>;
};

export type StockIdleDiagnosis = {
  sessionOpenNow: boolean;
  activeWatchCount: number;
  holdingsCount: number;
  cashYen: number;
  totalOrderCount: number;
  lastOrderAt: string | null;
  lastSyncedAt: string | null;
  syncAgeHours: number | null;
  allowLiveOrders: boolean | null;
  reasons: string[];
};

export type StockBrokerActivity = {
  today: StockActivityDaySummary;
  yesterday: StockActivityDaySummary;
  todayHourly: StockActivityHourBucket[];
  yesterdayHourly: StockActivityHourBucket[];
  monthTradeCount: number;
  monthBuyYen: number;
  monthSellYen: number;
  monthRealizedPnlYen: number;
  diagnosis: StockIdleDiagnosis;
};

function jstParts(d: Date): {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

export function jstDateKey(input: Date | string = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const { y, m, day } = jstParts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftJstDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 3, 0, 0);
  return jstDateKey(new Date(utc));
}

function dateLabelJa(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  return dt.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function isCheckOrder(o: StockBrokerOrderRecord): boolean {
  return o.symbol === STOCK_IDLE_CHECK_SYMBOL;
}

function isTradeLike(o: StockBrokerOrderRecord): boolean {
  if (isCheckOrder(o)) return false;
  return o.status === "dry_run" || o.status === "submitted";
}

function estimateNotional(
  o: StockBrokerOrderRecord,
  priceBySymbol: Map<string, number>,
): number {
  if (o.qty <= 0) return 0;
  const px = priceBySymbol.get(o.symbol) ?? 0;
  return px > 0 ? Math.round(o.qty * px) : 0;
}

function summarizeDay(
  dateKey: string,
  orders: StockBrokerOrderRecord[],
  priceBySymbol: Map<string, number>,
): StockActivityDaySummary {
  const checks = orders.filter(isCheckOrder);
  const trades = orders.filter(isTradeLike);
  const buys = trades.filter((o) => o.side === "buy");
  const sells = trades.filter((o) => o.side === "sell");
  return {
    date: dateKey,
    label: dateLabelJa(dateKey),
    tradeCount: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    buyYen: buys.reduce((s, o) => s + estimateNotional(o, priceBySymbol), 0),
    sellYen: sells.reduce((s, o) => s + estimateNotional(o, priceBySymbol), 0),
    realizedPnlYen: sells.reduce(
      (s, o) => s + (Number(o.realizedPnlYen) || 0),
      0,
    ),
    dryRunCount: trades.filter((o) => o.status === "dry_run").length,
    liveCount: trades.filter((o) => o.status === "submitted").length,
    checkCount: checks.length,
    symbols: [
      ...new Set(trades.map((o) => o.symbol).filter((s) => s && s !== STOCK_IDLE_CHECK_SYMBOL)),
    ],
  };
}

function buildHourlyBuckets(
  orders: StockBrokerOrderRecord[],
  priceBySymbol: Map<string, number>,
  options: { fillAllHours: boolean },
): StockActivityHourBucket[] {
  const byHour = new Map<number, StockActivityHourBucket>();
  const ensure = (hour: number): StockActivityHourBucket => {
    let b = byHour.get(hour);
    if (!b) {
      b = {
        hour,
        label: `${String(hour).padStart(2, "0")}時`,
        tradeCount: 0,
        checkCount: 0,
        buyYen: 0,
        sellYen: 0,
        realizedPnlYen: 0,
        actions: [],
      };
      byHour.set(hour, b);
    }
    return b;
  };

  if (options.fillAllHours) {
    for (let h = 0; h < 24; h++) ensure(h);
  }

  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const o of sorted) {
    const hour = jstParts(new Date(o.createdAt)).hour;
    const bucket = ensure(hour);
    const time = new Date(o.createdAt).toLocaleTimeString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
    const notional = estimateNotional(o, priceBySymbol);

    if (isCheckOrder(o)) {
      bucket.checkCount += 1;
      bucket.actions.push({
        time,
        side: "check",
        symbol: "点検",
        qty: 0,
        notionalYen: 0,
        status: o.status,
        reason: o.reason || o.message || "見送り",
      });
      continue;
    }

    if (!isTradeLike(o) && o.status !== "rejected" && o.status !== "skipped") {
      continue;
    }

    if (isTradeLike(o)) {
      bucket.tradeCount += 1;
      if (o.side === "buy") bucket.buyYen += notional;
      if (o.side === "sell") {
        bucket.sellYen += notional;
        bucket.realizedPnlYen += Number(o.realizedPnlYen) || 0;
      }
    }

    bucket.actions.push({
      time,
      side: o.side,
      symbol: o.symbol,
      qty: o.qty,
      notionalYen: notional,
      status: o.status,
      reason: o.reason || o.message || "",
    });
  }

  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function isRoughJpEquitySession(now = new Date()): boolean {
  const { hour, minute, weekday } = jstParts(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const mins = hour * 60 + minute;
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

export function buildStockIdleDiagnosis(input: {
  snapshot: StockBrokerSnapshot | null;
  orders: StockBrokerOrderRecord[];
  activeWatchCount: number;
  allowLiveOrders: boolean | null;
}): StockIdleDiagnosis {
  const { snapshot, orders, activeWatchCount, allowLiveOrders } = input;
  const cashYen = Math.round(snapshot?.cash.stockAccountWallet ?? 0);
  const holdingsCount = snapshot?.holdings.filter((h) => h.qty > 0).length ?? 0;
  const tradeOrders = orders.filter(isTradeLike);
  const lastOrderAt =
    orders.length > 0
      ? [...orders].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0].createdAt
      : null;
  const lastSyncedAt = snapshot?.syncedAt ?? null;
  const syncAgeHours = hoursSince(lastSyncedAt);
  const sessionOpenNow = isRoughJpEquitySession();
  const reasons: string[] = [];

  if (!snapshot) {
    reasons.push(
      "証券スナップショットがありません。VM の sync が一度も成功していないか、停止中です。",
    );
  } else if (syncAgeHours != null && syncAgeHours > 24) {
    reasons.push(
      `最終同期から約 ${Math.floor(syncAgeHours)} 時間経過しています。VM 停止／市場外だと更新が止まります。`,
    );
  }

  if (activeWatchCount === 0) {
    reasons.push(
      "アクティブな日本株ウォッチが 0 件です。登録銘柄が無いと買い・売りインテントは作れません。",
    );
  }

  if (holdingsCount === 0) {
    reasons.push(
      "証券側の保有が 0 件です。売りは発生せず、買いは AI が「買い＋上昇トレンド」と判定したときだけ出ます。",
    );
  }

  if (cashYen > 0 && holdingsCount === 0 && activeWatchCount > 0) {
    reasons.push(
      `現金約 ${cashYen.toLocaleString("ja-JP")} 円はありますが、直近は買い条件未達です（#8強気or押し目 / #44安値枠 / #45監視メモ。詳細は intents の buySkips）。`,
    );
  }

  if (tradeOrders.length === 0) {
    reasons.push(
      "Cosmos 上の発注ログ（dry-run / LIVE）が 0 件です。bridge の trade は「候補なし」のとき従来は記録せず終了していました（今後は点検レコードを残します）。",
    );
  }

  if (!sessionOpenNow) {
    reasons.push(
      "いまはおおよその現物ザラ場外です（平日 9:00–11:30 / 12:30–15:00 JST 付近）。場外でも判定は走りますが、LIVE 発注は場中向けです。",
    );
  }

  if (allowLiveOrders === false) {
    reasons.push(
      "LIVE 発注オフ（dry-run）です。条件達成時も実発注ではなく検証ログになります。",
    );
  }

  if (reasons.length === 0 && tradeOrders.length === 0) {
    reasons.push("条件未達のため見送り中です。15分ごとの trade で再判定します。");
  }

  return {
    sessionOpenNow,
    activeWatchCount,
    holdingsCount,
    cashYen,
    totalOrderCount: orders.length,
    lastOrderAt,
    lastSyncedAt,
    syncAgeHours,
    allowLiveOrders,
    reasons,
  };
}

export function buildStockBrokerActivity(input: {
  orders: StockBrokerOrderRecord[];
  snapshot: StockBrokerSnapshot | null;
  activeWatchCount: number;
  allowLiveOrders: boolean | null;
  now?: Date;
}): StockBrokerActivity {
  const now = input.now ?? new Date();
  const todayKey = jstDateKey(now);
  const yesterdayKey = shiftJstDateKey(todayKey, -1);
  const monthPrefix = todayKey.slice(0, 7);

  const priceBySymbol = new Map<string, number>();
  for (const h of input.snapshot?.holdings ?? []) {
    if (h.symbol && h.price > 0) priceBySymbol.set(h.symbol, h.price);
  }

  const todayOrders = input.orders.filter(
    (o) => jstDateKey(o.createdAt) === todayKey,
  );
  const yesterdayOrders = input.orders.filter(
    (o) => jstDateKey(o.createdAt) === yesterdayKey,
  );
  const monthOrders = input.orders.filter((o) =>
    jstDateKey(o.createdAt).startsWith(monthPrefix),
  );
  const monthTrades = monthOrders.filter(isTradeLike);

  return {
    today: summarizeDay(todayKey, todayOrders, priceBySymbol),
    yesterday: summarizeDay(yesterdayKey, yesterdayOrders, priceBySymbol),
    todayHourly: buildHourlyBuckets(todayOrders, priceBySymbol, {
      fillAllHours: true,
    }),
    yesterdayHourly: buildHourlyBuckets(yesterdayOrders, priceBySymbol, {
      fillAllHours: false,
    }),
    monthTradeCount: monthTrades.length,
    monthBuyYen: monthTrades
      .filter((o) => o.side === "buy")
      .reduce((s, o) => s + estimateNotional(o, priceBySymbol), 0),
    monthSellYen: monthTrades
      .filter((o) => o.side === "sell")
      .reduce((s, o) => s + estimateNotional(o, priceBySymbol), 0),
    monthRealizedPnlYen: monthTrades
      .filter((o) => o.side === "sell")
      .reduce((s, o) => s + (Number(o.realizedPnlYen) || 0), 0),
    diagnosis: buildStockIdleDiagnosis({
      snapshot: input.snapshot,
      orders: input.orders,
      activeWatchCount: input.activeWatchCount,
      allowLiveOrders: input.allowLiveOrders,
    }),
  };
}
