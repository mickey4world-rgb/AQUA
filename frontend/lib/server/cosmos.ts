import { CosmosClient, type Container } from "@azure/cosmos";

const containers = new Map<string, Container>();

export const COSMOS_CONTAINERS = {
  users: process.env.COSMOS_USERS_CONTAINER ?? "Users",
  stockWatches: process.env.COSMOS_STOCK_WATCHES_CONTAINER ?? "StockWatches",
} as const;

export function isCosmosConfigured(): boolean {
  return Boolean(process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY);
}

export function getContainer(containerId: string): Container {
  const cached = containers.get(containerId);
  if (cached) return cached;

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";

  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be configured");
  }

  const client = new CosmosClient({ endpoint, key });
  const container = client.database(databaseId).container(containerId);
  containers.set(containerId, container);
  return container;
}
