/**
 * ユーザーを Cosmos DB に登録する seed スクリプト
 *
 * 使い方:
 *   $env:COSMOS_ENDPOINT="..."
 *   $env:COSMOS_KEY="..."
 *   node scripts/seed-users.mjs
 */
import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
const containerId = process.env.COSMOS_USERS_CONTAINER ?? "Users";

if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT と COSMOS_KEY を設定してください");
  process.exit(1);
}

const SEED_USERS = [
  {
    id: "user-aya",
    userId: "user-aya",
    email: "aya@personal.apps",
    displayName: "Aya",
    authProvider: "github",
    notifyEmail: "aya@personal.apps",
    monthlyTokenLimit: 100_000,
  },
  {
    id: "user-gest",
    userId: "user-gest",
    email: "gest@personal.apps",
    displayName: "Gest",
    authProvider: "github",
    notifyEmail: "gest@personal.apps",
    monthlyTokenLimit: 100_000,
  },
];

const client = new CosmosClient({ endpoint, key });
const container = client.database(databaseId).container(containerId);

const now = new Date().toISOString();

for (const seed of SEED_USERS) {
  const doc = { ...seed, createdAt: now, updatedAt: now };
  try {
    const { resource } = await container.items.upsert(doc);
    console.log(`✓ ${resource.displayName} (${resource.userId}) を登録しました`);
  } catch (err) {
    console.error(`✗ ${seed.displayName} の登録に失敗:`, err.message);
  }
}
