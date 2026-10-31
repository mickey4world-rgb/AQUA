/**
 * ユーザーを Cosmos DB に登録する seed スクリプト
 *
 * 使い方:
 *   $env:COSMOS_ENDPOINT="..."
 *   $env:COSMOS_KEY="..."
 *   $env:SEED_USERS_JSON='[{"id":"user-x","email":"x@example.invalid","displayName":"X","authProvider":"aad"}]'
 *   node scripts/seed-users.mjs
 *
 * 実メールは公開リポジトリに置かないため、登録内容は SEED_USERS_JSON で渡す。
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

let seedInput;
try {
  seedInput = JSON.parse(process.env.SEED_USERS_JSON ?? "");
} catch {
  console.error("SEED_USERS_JSON に JSON 配列を設定してください");
  process.exit(1);
}
if (!Array.isArray(seedInput) || seedInput.length === 0) {
  console.error("SEED_USERS_JSON が空です");
  process.exit(1);
}

const SEED_USERS = seedInput.map((u) => ({
  id: u.id,
  userId: u.id,
  email: u.email,
  displayName: u.displayName,
  authProvider: u.authProvider ?? "aad",
  notifyEmail: u.notifyEmail ?? u.email,
  monthlyTokenLimit: u.monthlyTokenLimit ?? 1_000_000,
}));

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
