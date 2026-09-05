import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { queryMoneyFlow, listGyoseiYears } from "@/lib/server/gyosei-data";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { MoneyFlowResponse } from "@/lib/types/gyosei";

type CachedPublicPreview = {
  id: string;
  year: number;
  snapshot: MoneyFlowResponse;
  builtAt: string;
};

const STATIC_SNAPSHOT_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "gyosei",
  "public-preview.json",
);

const CACHE_DOC_ID = "works-money-flow-public-preview";
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

let memoryCache: { year: number; snapshot: MoneyFlowResponse; builtAt: number } | null =
  null;

function readStaticSnapshot(): MoneyFlowResponse | null {
  try {
    if (!existsSync(STATIC_SNAPSHOT_PATH)) return null;
    return JSON.parse(readFileSync(STATIC_SNAPSHOT_PATH, "utf8")) as MoneyFlowResponse;
  } catch {
    return null;
  }
}

async function readCosmosSnapshot(): Promise<MoneyFlowResponse | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resource } = await container
      .item(CACHE_DOC_ID, CACHE_DOC_ID)
      .read<CachedPublicPreview>();
    return resource?.snapshot ?? null;
  } catch {
    return null;
  }
}

async function writeCosmosSnapshot(snapshot: MoneyFlowResponse): Promise<void> {
  if (!isCosmosConfigured()) return;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const doc: CachedPublicPreview = {
      id: CACHE_DOC_ID,
      year: snapshot.year,
      snapshot,
      builtAt: new Date().toISOString(),
    };
    await container.items.upsert(doc);
  } catch (error) {
    console.warn(
      "[gyosei-public-preview] cosmos write failed",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * オンライン表示専用。gzip展開・集計は行わない。
 * 優先順位: メモリ → 同梱JSON → Cosmos。いずれも無ければ null。
 */
export async function getWorksMoneyFlowPublicPreview(): Promise<MoneyFlowResponse | null> {
  if (memoryCache && Date.now() - memoryCache.builtAt < MEMORY_TTL_MS) {
    return memoryCache.snapshot;
  }

  const fromStatic = readStaticSnapshot();
  if (fromStatic) {
    memoryCache = { year: fromStatic.year, snapshot: fromStatic, builtAt: Date.now() };
    return fromStatic;
  }

  const fromCosmos = await readCosmosSnapshot();
  if (fromCosmos) {
    memoryCache = { year: fromCosmos.year, snapshot: fromCosmos, builtAt: Date.now() };
    return fromCosmos;
  }

  return null;
}

/** バッチ／cron 専用。重い集計はここでだけ実行する。 */
export async function warmWorksMoneyFlowPublicPreview(): Promise<{
  year: number;
  builtAt: string;
  source: "rebuild";
}> {
  const years = listGyoseiYears();
  const year = years[years.length - 1] ?? years[0];
  const snapshot = await queryMoneyFlow({
    year,
    limit: 40,
    rowMode: "aggregate",
  });
  memoryCache = { year: snapshot.year, snapshot, builtAt: Date.now() };
  await writeCosmosSnapshot(snapshot);
  return {
    year: snapshot.year,
    builtAt: new Date().toISOString(),
    source: "rebuild",
  };
}
