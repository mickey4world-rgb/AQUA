import bundledPreview from "../../data/gyosei/public-preview.json";
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

const CACHE_DOC_ID = "works-money-flow-public-preview";
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

let memoryCache: { year: number; snapshot: MoneyFlowResponse; builtAt: number } | null =
  null;
let rebuildInFlight: Promise<MoneyFlowResponse | null> | null = null;

function readStaticSnapshot(): MoneyFlowResponse | null {
  const candidates = [
    path.join(process.cwd(), "data", "gyosei", "public-preview.json"),
    path.join(process.cwd(), "frontend", "data", "gyosei", "public-preview.json"),
  ];
  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) continue;
      return JSON.parse(readFileSync(filePath, "utf8")) as MoneyFlowResponse;
    } catch (error) {
      console.warn("[gyosei-public-preview] static read failed", filePath, error);
    }
  }

  // ビルド同梱（cwd ずれでも空にしない）
  if (bundledPreview && typeof bundledPreview === "object" && "year" in bundledPreview) {
    return bundledPreview as MoneyFlowResponse;
  }
  return null;
}

async function readCosmosSnapshot(): Promise<MoneyFlowResponse | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resource } = await container
      .item(CACHE_DOC_ID, CACHE_DOC_ID)
      .read<CachedPublicPreview>();
    return resource?.snapshot ?? null;
  } catch (error) {
    console.warn("[gyosei-public-preview] cosmos read failed", error);
    return null;
  }
}

async function writeCosmosSnapshot(snapshot: MoneyFlowResponse): Promise<boolean> {
  if (!isCosmosConfigured()) {
    console.warn("[gyosei-public-preview] cosmos not configured");
    return false;
  }
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const doc: CachedPublicPreview = {
      id: CACHE_DOC_ID,
      year: snapshot.year,
      snapshot,
      builtAt: new Date().toISOString(),
    };
    await container.items.upsert(doc);
    return true;
  } catch (error) {
    console.error("[gyosei-public-preview] cosmos write failed", error);
    return false;
  }
}

async function rebuildSnapshot(): Promise<MoneyFlowResponse | null> {
  if (rebuildInFlight) return rebuildInFlight;
  rebuildInFlight = (async () => {
    try {
      const years = listGyoseiYears();
      const year = years[years.length - 1] ?? years[0];
      const snapshot = await queryMoneyFlow({
        year,
        limit: 40,
        rowMode: "aggregate",
      });
      memoryCache = { year: snapshot.year, snapshot, builtAt: Date.now() };
      await writeCosmosSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      console.error("[gyosei-public-preview] rebuild failed", error);
      return null;
    } finally {
      rebuildInFlight = null;
    }
  })();
  return rebuildInFlight;
}

/**
 * 公開表示。メモリ → 同梱/静的JSON → Cosmos →（必要なら）再集計。
 * 空 503 を極力出さない。
 */
export async function getWorksMoneyFlowPublicPreview(options?: {
  allowRebuild?: boolean;
}): Promise<MoneyFlowResponse | null> {
  const allowRebuild = options?.allowRebuild !== false;

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

  if (allowRebuild) {
    console.warn("[gyosei-public-preview] snapshot missing — rebuilding");
    return rebuildSnapshot();
  }

  return null;
}

/** バッチ／cron 専用。重い集計はここでだけ実行する。 */
export async function warmWorksMoneyFlowPublicPreview(): Promise<{
  year: number;
  builtAt: string;
  source: "rebuild";
  cosmosPersisted: boolean;
}> {
  const years = listGyoseiYears();
  const year = years[years.length - 1] ?? years[0];
  const snapshot = await queryMoneyFlow({
    year,
    limit: 40,
    rowMode: "aggregate",
  });
  memoryCache = { year: snapshot.year, snapshot, builtAt: Date.now() };
  const cosmosPersisted = await writeCosmosSnapshot(snapshot);
  if (!cosmosPersisted && isCosmosConfigured()) {
    throw new Error("Works money-flow snapshot could not be persisted to Cosmos");
  }
  return {
    year: snapshot.year,
    builtAt: new Date().toISOString(),
    source: "rebuild",
    cosmosPersisted,
  };
}

export async function persistUploadedWorksMoneyFlowSnapshot(
  snapshot: MoneyFlowResponse,
): Promise<boolean> {
  memoryCache = { year: snapshot.year, snapshot, builtAt: Date.now() };
  return writeCosmosSnapshot(snapshot);
}
