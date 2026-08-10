import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { AzureInfraCostSummary } from "@/lib/types/analytics";

const CACHE_USER_ID = "system";
const FRESH_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AzureCostCacheDoc = {
  id: string;
  userId: typeof CACHE_USER_ID;
  kind: "azure-cost-cache";
  cacheKey: string;
  cachedAt: string;
  data: AzureInfraCostSummary;
};

const memoryCache = new Map<
  string,
  { expiresAt: number; cachedAt: number; data: AzureInfraCostSummary }
>();

function docId(cacheKey: string): string {
  return `azure-cost:${cacheKey.replace(/[^a-zA-Z0-9:_-]/g, "_")}`;
}

export function readMemoryAzureCostCache(
  cacheKey: string,
  allowStale = false,
): AzureInfraCostSummary | null {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  const age = Date.now() - entry.cachedAt;
  if (entry.expiresAt > Date.now() || (allowStale && age < STALE_TTL_MS)) {
    return entry.data;
  }
  return null;
}

export function writeMemoryAzureCostCache(
  cacheKey: string,
  data: AzureInfraCostSummary,
): void {
  memoryCache.set(cacheKey, {
    expiresAt: Date.now() + FRESH_TTL_MS,
    cachedAt: Date.now(),
    data,
  });
}

export async function readCosmosAzureCostCache(
  cacheKey: string,
  allowStale = false,
): Promise<AzureInfraCostSummary | null> {
  if (!isCosmosConfigured()) return null;

  try {
    const { resource } = await getContainer(COSMOS_CONTAINERS.tokenUsage)
      .item(docId(cacheKey), CACHE_USER_ID)
      .read<AzureCostCacheDoc>();
    if (!resource?.data) return null;

    const cachedAt = Date.parse(resource.cachedAt);
    if (!Number.isFinite(cachedAt)) return null;

    const age = Date.now() - cachedAt;
    if (age <= FRESH_TTL_MS || (allowStale && age <= STALE_TTL_MS)) {
      writeMemoryAzureCostCache(cacheKey, resource.data);
      return resource.data;
    }
  } catch {
    return null;
  }

  return null;
}

export async function writeCosmosAzureCostCache(
  cacheKey: string,
  data: AzureInfraCostSummary,
): Promise<void> {
  writeMemoryAzureCostCache(cacheKey, data);
  if (!isCosmosConfigured()) return;

  const doc: AzureCostCacheDoc = {
    id: docId(cacheKey),
    userId: CACHE_USER_ID,
    kind: "azure-cost-cache",
    cacheKey,
    cachedAt: new Date().toISOString(),
    data,
  };

  try {
    await getContainer(COSMOS_CONTAINERS.tokenUsage).items.upsert(doc);
  } catch (error) {
    console.warn("[azure-cost-cache] upsert failed", error);
  }
}

export async function readAzureCostCache(
  cacheKey: string,
  allowStale = false,
): Promise<AzureInfraCostSummary | null> {
  const freshMemory = readMemoryAzureCostCache(cacheKey, false);
  if (freshMemory) return freshMemory;

  const cosmos = await readCosmosAzureCostCache(cacheKey, allowStale);
  if (cosmos) return cosmos;

  return readMemoryAzureCostCache(cacheKey, allowStale);
}
