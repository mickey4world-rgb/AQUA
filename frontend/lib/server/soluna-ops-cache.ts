/**
 * Soluna 運用分析レポートのバッチキャッシュ。
 * コスト画面を開くたびに Note API / 公開板を叩かない。
 */
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { SOLUNA_SYSTEM_USER_ID } from "@/lib/server/soluna-system-config";
import type { SolunaOpsAnalyticsReport } from "@/lib/types/analytics";

const CACHE_USER_ID = SOLUNA_SYSTEM_USER_ID;
/** 鮮度ありとみなす時間（この間は再構築しない） */
const FRESH_TTL_MS = 20 * 60 * 1000;
/** 古いキャッシュでも表示に使う上限 */
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

type SolunaOpsCacheDoc = {
  id: string;
  userId: typeof CACHE_USER_ID;
  kind: "soluna-ops-cache";
  month: string;
  cachedAt: string;
  data: SolunaOpsAnalyticsReport;
};

const memoryCache = new Map<
  string,
  { cachedAt: number; data: SolunaOpsAnalyticsReport }
>();

function docId(month: string): string {
  return `soluna-ops:${month}`;
}

export function readMemorySolunaOpsCache(
  month: string,
  allowStale = false,
): SolunaOpsAnalyticsReport | null {
  const entry = memoryCache.get(month);
  if (!entry) return null;
  const age = Date.now() - entry.cachedAt;
  if (age <= FRESH_TTL_MS || (allowStale && age <= STALE_TTL_MS)) {
    return entry.data;
  }
  return null;
}

export function writeMemorySolunaOpsCache(
  month: string,
  data: SolunaOpsAnalyticsReport,
): void {
  memoryCache.set(month, { cachedAt: Date.now(), data });
}

export async function readCosmosSolunaOpsCache(
  month: string,
  allowStale = false,
): Promise<SolunaOpsAnalyticsReport | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const { resource } = await getContainer(COSMOS_CONTAINERS.solunaRecords)
      .item(docId(month), CACHE_USER_ID)
      .read<SolunaOpsCacheDoc>();
    if (!resource?.data) return null;
    const cachedAt = Date.parse(resource.cachedAt);
    if (!Number.isFinite(cachedAt)) return null;
    const age = Date.now() - cachedAt;
    if (age <= FRESH_TTL_MS || (allowStale && age <= STALE_TTL_MS)) {
      writeMemorySolunaOpsCache(month, resource.data);
      return resource.data;
    }
  } catch {
    return null;
  }
  return null;
}

export async function writeCosmosSolunaOpsCache(
  month: string,
  data: SolunaOpsAnalyticsReport,
): Promise<void> {
  writeMemorySolunaOpsCache(month, data);
  if (!isCosmosConfigured()) return;
  const doc: SolunaOpsCacheDoc = {
    id: docId(month),
    userId: CACHE_USER_ID,
    kind: "soluna-ops-cache",
    month,
    cachedAt: new Date().toISOString(),
    data,
  };
  try {
    await getContainer(COSMOS_CONTAINERS.solunaRecords).items.upsert(doc);
  } catch (error) {
    console.warn("[soluna-ops-cache] upsert failed", error);
  }
}

export async function readSolunaOpsCache(
  month: string,
  allowStale = false,
): Promise<SolunaOpsAnalyticsReport | null> {
  const freshMemory = readMemorySolunaOpsCache(month, false);
  if (freshMemory) return freshMemory;
  const cosmos = await readCosmosSolunaOpsCache(month, allowStale);
  if (cosmos) return cosmos;
  return readMemorySolunaOpsCache(month, allowStale);
}

export function isSolunaOpsCacheFresh(month: string): boolean {
  return Boolean(readMemorySolunaOpsCache(month, false));
}
