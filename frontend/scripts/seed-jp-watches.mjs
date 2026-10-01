/**
 * Seed JP stock watches for Mickey's auto-trade universe (Sep 22 candidates + parked A-list).
 * Usage (from frontend/, with COSMOS_* and SEED_USER_ID in env):
 *   npx --yes tsx scripts/seed-jp-watches.mjs
 */
import { randomUUID } from "crypto";
import { CosmosClient } from "@azure/cosmos";

const userId = process.env.SEED_USER_ID?.trim();
const endpoint = process.env.COSMOS_ENDPOINT?.trim();
const key = process.env.COSMOS_KEY?.trim();
const databaseId = process.env.COSMOS_DATABASE?.trim() || "personal-apps";
const containerId =
  process.env.COSMOS_STOCK_WATCHES_CONTAINER?.trim() || "StockWatches";

if (!userId || !endpoint || !key) {
  console.error("Need SEED_USER_ID, COSMOS_ENDPOINT, COSMOS_KEY");
  process.exit(1);
}

/** @type {Array<{code:string,name:string,buyPrice:number,shares:number,memo:string,active:boolean}>} */
const CANDIDATES = JSON.parse(process.env.SEED_CANDIDATES_JSON || "[]");
if (!Array.isArray(CANDIDATES) || CANDIDATES.length === 0) {
  console.error("SEED_CANDIDATES_JSON empty");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const { database } = await client.databases.createIfNotExists({ id: databaseId });
const { container } = await database.containers.createIfNotExists({
  id: containerId,
  partitionKey: { paths: ["/userId"] },
});

const { resources: existing } = await container.items
  .query({
    query:
      "SELECT c.id, c.ticker, c.market, c.isActive FROM c WHERE c.userId = @userId",
    parameters: [{ name: "@userId", value: userId }],
  })
  .fetchAll();

const have = new Set(
  existing
    .filter((w) => (w.market ?? "us") === "jp")
    .map((w) => String(w.ticker).replace(/\.T$/i, "")),
);

const now = new Date().toISOString();
const created = [];
for (const c of CANDIDATES) {
  const code = String(c.code);
  if (have.has(code)) {
    console.log(`SKIP existing ${code}`);
    continue;
  }
  const ticker = `${code}.T`;
  const mult = 1.2;
  const buyPrice = Number(c.buyPrice);
  const doc = {
    id: randomUUID(),
    userId,
    ticker,
    market: "jp",
    name: c.name,
    buyPrice,
    shares: Number(c.shares) || 0,
    targetMultiplier: mult,
    targetPrice: buyPrice * mult,
    memo: c.memo,
    isActive: c.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  await container.items.create(doc);
  created.push(code);
  console.log(`CREATE ${code} ${c.name} @${buyPrice} active=${doc.isActive}`);
}

console.log(JSON.stringify({ created, skipped: [...have], totalNew: created.length }));
