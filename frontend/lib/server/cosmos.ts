import { CosmosClient, type Container } from "@azure/cosmos";

const containers = new Map<string, Container>();
const ensuredContainers = new Set<string>();

export const COSMOS_CONTAINERS = {
  users: process.env.COSMOS_USERS_CONTAINER ?? "Users",
  stockWatches: process.env.COSMOS_STOCK_WATCHES_CONTAINER ?? "StockWatches",
  tokenUsage: process.env.COSMOS_TOKEN_USAGE_CONTAINER ?? "TokenUsage",
  accessLogs: process.env.COSMOS_ACCESS_LOGS_CONTAINER ?? "AccessLogs",
  pageViewLogs: process.env.COSMOS_PAGE_VIEW_LOGS_CONTAINER ?? "PageViewLogs",
  securityEvents: process.env.COSMOS_SECURITY_EVENTS_CONTAINER ?? "SecurityEvents",
  workNotes: process.env.COSMOS_WORK_NOTES_CONTAINER ?? "WorkNotes",
  solunaRecords: process.env.COSMOS_SOLUNA_CONTAINER ?? "SolunaRecords",
  solunaTokens: process.env.COSMOS_SOLUNA_TOKENS_CONTAINER ?? "SolunaTokens",
  disneyRecords: process.env.COSMOS_DISNEY_CONTAINER ?? "DisneyRecords",
} as const;

export function isCosmosConfigured(): boolean {
  return Boolean(process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY);
}

function getClientAndDatabase() {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";

  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be configured");
  }

  const client = new CosmosClient({ endpoint, key });
  return { client, databaseId };
}

export function getContainer(containerId: string): Container {
  const cached = containers.get(containerId);
  if (cached) return cached;

  const { client, databaseId } = getClientAndDatabase();
  const container = client.database(databaseId).container(containerId);
  containers.set(containerId, container);
  return container;
}

/**
 * コンテナが無いと upsert が 404 NotFound になる。
 * 公開キャッシュ用に /id パーティションで作成を試みる。
 */
export async function ensureContainer(containerId: string): Promise<Container> {
  if (ensuredContainers.has(containerId) && containers.has(containerId)) {
    return containers.get(containerId)!;
  }

  const { client, databaseId } = getClientAndDatabase();
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: ["/id"] },
  });
  containers.set(containerId, container);
  ensuredContainers.add(containerId);
  return container;
}

/**
 * DisneyRecords を優先。未作成・権限不足なら SolunaRecords にフォールバック。
 */
export async function getPublicCacheContainer(): Promise<{
  container: Container;
  containerId: string;
}> {
  const primary = COSMOS_CONTAINERS.disneyRecords;
  const fallback = COSMOS_CONTAINERS.solunaRecords;

  try {
    const container = await ensureContainer(primary);
    return { container, containerId: primary };
  } catch (error) {
    console.warn(
      `[cosmos] ensure/use ${primary} failed; falling back to ${fallback}`,
      error instanceof Error ? error.message : error,
    );
    const container = await ensureContainer(fallback);
    return { container, containerId: fallback };
  }
}
