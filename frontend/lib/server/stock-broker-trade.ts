import { createHash, randomUUID } from "crypto";
import { COSMOS_CONTAINERS } from "@/lib/server/cosmos";
import { CosmosClient, type Container } from "@azure/cosmos";
import { analyzeStock } from "@/lib/server/stock-analysis";
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listStockWatches } from "@/lib/server/stock-watches";
import { displayTicker } from "@/lib/stock-utils";
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

/** 東証取引時間の粗い判定（祝日は未考慮 — bridge 側でも再チェック） */
export function isRoughJpEquitySession(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  if (weekday === "Sat" || weekday === "Sun") return false;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;
  // 9:00–11:30 / 12:30–15:00
  return (mins >= 9 * 60 && mins <= 11 * 60 + 30) || (mins >= 12 * 60 + 30 && mins <= 15 * 60);
}

/**
 * Phase C1: 日本株ウォッチが sell かつ証券保有があるものだけ売りインテント。
 * 買いはまだ出さない（誤爆面が大きい）。
 */
export async function buildStockBrokerTradeIntents(
  userId: string,
): Promise<StockBrokerTradeIntent[]> {
  const snapshot = await getStockBrokerSnapshot(userId);
  if (!snapshot || snapshot.holdings.length === 0) return [];

  const watches = (await listStockWatches(userId)).filter(
    (w) => w.isActive && (w.market ?? "us") === "jp",
  );
  if (watches.length === 0) return [];

  const day = jstDayId();
  const expiresAt = new Date(Date.now() + 45 * 60_000).toISOString();
  const intents: StockBrokerTradeIntent[] = [];

  for (const watch of watches) {
    let advice;
    try {
      advice = await analyzeStock(watch);
    } catch {
      continue;
    }
    if (advice.action !== "sell") continue;

    const symbol = displayTicker(watch.ticker, "jp");
    const holding = snapshot.holdings.find(
      (h) => h.symbol === symbol && h.qty > 0,
    );
    if (!holding) continue;

    const watchQty =
      typeof watch.shares === "number" && watch.shares > 0
        ? watch.shares
        : holding.qty;
    const qty = Math.min(holding.qty, watchQty);
    if (qty <= 0) continue;

    intents.push({
      id: intentIdFor(userId, symbol, "sell", day),
      userId,
      side: "sell",
      symbol,
      watchTicker: watch.ticker,
      symbolName: holding.symbolName || watch.name,
      exchange: holding.exchange || 1,
      qty,
      frontOrderType: 10,
      reason: `ウォッチAI売り検討: ${advice.summary.slice(0, 120)}`,
      watchId: watch.id,
      adviceAction: advice.action,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
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
