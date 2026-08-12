/**
 * Cosmos DB Soluna コンテナを作成する。
 *
 *   node scripts/setup-soluna.mjs
 */

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
const recordsId = process.env.COSMOS_SOLUNA_CONTAINER ?? "SolunaRecords";
const tokensId = process.env.COSMOS_SOLUNA_TOKENS_CONTAINER ?? "SolunaTokens";

if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT and COSMOS_KEY are required");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const { database } = await client.databases.createIfNotExists({ id: databaseId });

const { container: records } = await database.containers.createIfNotExists({
  id: recordsId,
  partitionKey: { paths: ["/userId"] },
});

const { container: tokens } = await database.containers.createIfNotExists({
  id: tokensId,
  partitionKey: { paths: ["/id"] },
});

console.log(`SolunaRecords container ready: ${records.id}`);
console.log(`SolunaTokens container ready: ${tokens.id}`);
