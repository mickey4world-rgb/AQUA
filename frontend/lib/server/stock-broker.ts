import { CosmosClient, type Container } from "@azure/cosmos";
import { COSMOS_CONTAINERS } from "@/lib/server/cosmos";
import type {
  StockBrokerSnapshot,
  StockBrokerSyncPayload,
} from "@/lib/types/stock-broker";

let brokerContainerCache: Container | null = null;

/** StockWatches と同様 /userId パーティション */
async function brokerContainer(): Promise<Container> {
  if (brokerContainerCache) return brokerContainerCache;

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
    id: COSMOS_CONTAINERS.stockBroker,
    partitionKey: { paths: ["/userId"] },
  });
  brokerContainerCache = container;
  return container;
}

function snapshotId(userId: string): string {
  return `broker-${userId}`;
}

export async function upsertStockBrokerSnapshot(
  payload: StockBrokerSyncPayload,
): Promise<StockBrokerSnapshot> {
  const now = new Date().toISOString();
  const userId = payload.userId.trim();
  if (!userId) {
    throw new Error("userId is required");
  }

  const holdings = Array.isArray(payload.holdings)
    ? payload.holdings
        .filter((h) => h && typeof h.symbol === "string" && h.symbol.length > 0)
        .map((h) => ({
          symbol: h.symbol.trim(),
          symbolName: String(h.symbolName ?? "").trim(),
          exchange: Number(h.exchange) || 0,
          qty: Number(h.qty) || 0,
          price: Number(h.price) || 0,
          side: h.side ? String(h.side) : undefined,
          accountType:
            typeof h.accountType === "number" ? h.accountType : undefined,
        }))
    : [];

  const doc: StockBrokerSnapshot = {
    id: snapshotId(userId),
    userId,
    broker: "kabu",
    syncedAt: payload.syncedAt ?? now,
    cash: {
      stockAccountWallet: Number(payload.cash?.stockAccountWallet) || 0,
      auKCStockAuShareWallet:
        Number(payload.cash?.auKCStockAuShareWallet) || 0,
      auPayCardWallet: Number(payload.cash?.auPayCardWallet) || 0,
    },
    holdings,
    rawPositionCount: payload.rawPositionCount ?? holdings.length,
    updatedAt: now,
  };

  await (await brokerContainer()).items.upsert(doc);
  return doc;
}

export async function getStockBrokerSnapshot(
  userId: string,
): Promise<StockBrokerSnapshot | null> {
  try {
    const { resource } = await (await brokerContainer())
      .item(snapshotId(userId), userId)
      .read<StockBrokerSnapshot>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export function authorizeStockBridge(request: Request): boolean {
  const secret = process.env.STOCK_KABU_BRIDGE_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  return header === `Bearer ${secret}`;
}
