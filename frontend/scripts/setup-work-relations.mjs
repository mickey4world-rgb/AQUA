/**
 * Cosmos DB WorkRelations コンテナ（個人関係図ワークスペース）を作成する。
 *
 * 使い方:
 *   $env:COSMOS_ENDPOINT="..."
 *   $env:COSMOS_KEY="..."
 *   node scripts/setup-work-relations.mjs
 */

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
const containerId =
  process.env.COSMOS_WORK_RELATIONS_CONTAINER ?? "WorkRelations";

if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT and COSMOS_KEY are required");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const { database } = await client.databases.createIfNotExists({ id: databaseId });
const { container } = await database.containers.createIfNotExists({
  id: containerId,
  partitionKey: { paths: ["/userId"] },
});

console.log(`WorkRelations container ready: ${container.id}`);
