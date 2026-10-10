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

  // Successful sync implies token OK — clear stale needs_otp without wiping other meta.
  const existing = await getStockBrokerSnapshot(userId);
  const mergedMeta = payload.bridgeMeta
    ? normalizeBridgeMeta({
        ...payload.bridgeMeta,
        recoveryStatus: payload.bridgeMeta.recoveryStatus ?? "ok",
        recoveryAction: payload.bridgeMeta.recoveryAction ?? "sync",
        recoveryAt: payload.bridgeMeta.recoveryAt ?? now,
      })
    : existing?.bridgeMeta;

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
    bridgeMeta: mergedMeta,
    updatedAt: now,
  };

  await (await brokerContainer()).items.upsert(doc);
  return doc;
}

function normalizeBridgeMeta(
  meta: NonNullable<StockBrokerSyncPayload["bridgeMeta"]>,
): NonNullable<StockBrokerSnapshot["bridgeMeta"]> {
  return {
    allowLiveOrders: Boolean(meta.allowLiveOrders),
    kabuBaseUrl:
      typeof meta.kabuBaseUrl === "string" ? meta.kabuBaseUrl : undefined,
    kabuPort: typeof meta.kabuPort === "number" ? meta.kabuPort : undefined,
    stationReachable:
      typeof meta.stationReachable === "boolean"
        ? meta.stationReachable
        : undefined,
    stationTokenOk:
      typeof meta.stationTokenOk === "boolean"
        ? meta.stationTokenOk
        : undefined,
    lastError:
      typeof meta.lastError === "string"
        ? meta.lastError.slice(0, 240)
        : meta.lastError === null
          ? null
          : undefined,
    healthReportedAt:
      typeof meta.healthReportedAt === "string"
        ? meta.healthReportedAt
        : undefined,
    recoveryStatus:
      typeof meta.recoveryStatus === "string"
        ? meta.recoveryStatus.slice(0, 40)
        : undefined,
    recoveryAction:
      typeof meta.recoveryAction === "string"
        ? meta.recoveryAction.slice(0, 80)
        : undefined,
    recoveryAt:
      typeof meta.recoveryAt === "string" ? meta.recoveryAt : undefined,
  };
}

/**
 * sync 失敗時でもヘルスだけ更新（現金・保有は既存を維持）。
 * スナップショットが無いときは最小ドキュメントを作る。
 */
export async function upsertStockBrokerHealth(input: {
  userId: string;
  stationReachable: boolean;
  stationTokenOk: boolean;
  lastError?: string | null;
  allowLiveOrders?: boolean;
  kabuBaseUrl?: string;
  kabuPort?: number;
  reportedAt?: string;
  recoveryStatus?: string;
  recoveryAction?: string;
  recoveryAt?: string;
}): Promise<StockBrokerSnapshot> {
  const now = new Date().toISOString();
  const userId = input.userId.trim();
  if (!userId) throw new Error("userId is required");

  const existing = await getStockBrokerSnapshot(userId);
  const reportedAt = input.reportedAt ?? now;
  const bridgeMeta = normalizeBridgeMeta({
    allowLiveOrders:
      input.allowLiveOrders ?? existing?.bridgeMeta?.allowLiveOrders ?? false,
    kabuBaseUrl: input.kabuBaseUrl ?? existing?.bridgeMeta?.kabuBaseUrl,
    kabuPort: input.kabuPort ?? existing?.bridgeMeta?.kabuPort,
    stationReachable: input.stationReachable,
    stationTokenOk: input.stationTokenOk,
    lastError: input.lastError ?? null,
    healthReportedAt: reportedAt,
    recoveryStatus:
      input.recoveryStatus ?? existing?.bridgeMeta?.recoveryStatus,
    recoveryAction:
      input.recoveryAction ?? existing?.bridgeMeta?.recoveryAction,
    recoveryAt: input.recoveryAt ?? existing?.bridgeMeta?.recoveryAt,
  });

  const doc: StockBrokerSnapshot = {
    id: snapshotId(userId),
    userId,
    broker: "kabu",
    syncedAt: existing?.syncedAt ?? reportedAt,
    cash: existing?.cash ?? {
      stockAccountWallet: 0,
      auKCStockAuShareWallet: 0,
      auPayCardWallet: 0,
    },
    holdings: existing?.holdings ?? [],
    rawPositionCount: existing?.rawPositionCount ?? 0,
    bridgeMeta,
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
