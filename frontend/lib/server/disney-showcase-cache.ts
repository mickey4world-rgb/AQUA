import { getJstToday } from "@/lib/disney-holidays";
import { buildDisneyShowcaseSnapshot } from "@/lib/server/disney-public-preview";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { DisneyShowcaseSnapshot } from "@/lib/types/disney";

type CachedShowcase = {
  id: string;
  date: string;
  snapshot: DisneyShowcaseSnapshot;
  builtAt: string;
};

let memoryCache: { date: string; snapshot: DisneyShowcaseSnapshot; builtAt: number } | null =
  null;
let buildPromise: Promise<DisneyShowcaseSnapshot> | null = null;

const MEMORY_TTL_MS = 55 * 60 * 1000;

function cacheDocId(date: string): string {
  return `public-showcase-${date}`;
}

async function readCosmosCache(date: string): Promise<DisneyShowcaseSnapshot | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resource } = await container.item(cacheDocId(date), cacheDocId(date)).read<CachedShowcase>();
    return resource?.date === date ? resource.snapshot : null;
  } catch {
    return null;
  }
}

async function writeCosmosCache(date: string, snapshot: DisneyShowcaseSnapshot): Promise<void> {
  if (!isCosmosConfigured()) return;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const doc: CachedShowcase = {
      id: cacheDocId(date),
      date,
      snapshot,
      builtAt: new Date().toISOString(),
    };
    await container.items.upsert(doc);
  } catch {
    // キャッシュ書き込み失敗は本番応答を止めない
  }
}

async function buildFreshSnapshot(): Promise<DisneyShowcaseSnapshot> {
  const snapshot = await buildDisneyShowcaseSnapshot({ skipLiveFetch: true });
  const today = getJstToday();
  memoryCache = { date: today, snapshot, builtAt: Date.now() };
  void writeCosmosCache(today, snapshot);
  return snapshot;
}

/** 公開プレビュー用スナップショット（他 API と分離・キャッシュ優先） */
export async function getDisneyShowcaseSnapshot(
  options: { force?: boolean } = {},
): Promise<DisneyShowcaseSnapshot> {
  const today = getJstToday();

  if (
    !options.force &&
    memoryCache?.date === today &&
    Date.now() - memoryCache.builtAt < MEMORY_TTL_MS
  ) {
    return memoryCache.snapshot;
  }

  if (!options.force) {
    const fromCosmos = await readCosmosCache(today);
    if (fromCosmos) {
      memoryCache = { date: today, snapshot: fromCosmos, builtAt: Date.now() };
      return fromCosmos;
    }
  }

  if (!buildPromise) {
    buildPromise = buildFreshSnapshot().finally(() => {
      buildPromise = null;
    });
  }
  return buildPromise;
}

export async function warmDisneyShowcaseCache(): Promise<{
  date: string;
  builtAt: string;
}> {
  const snapshot = await getDisneyShowcaseSnapshot({ force: true });
  return { date: snapshot.today, builtAt: snapshot.generatedAt };
}
