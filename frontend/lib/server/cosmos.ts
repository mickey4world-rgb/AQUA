import { CosmosClient, type Container } from "@azure/cosmos";

let container: Container | null = null;

function getContainer(): Container {
  if (container) return container;

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
  const containerId = process.env.COSMOS_USERS_CONTAINER ?? "Users";

  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be configured");
  }

  const client = new CosmosClient({ endpoint, key });
  container = client.database(databaseId).container(containerId);
  return container;
}

export function isCosmosConfigured(): boolean {
  return Boolean(process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY);
}

export { getContainer };
