import { getJstToday } from "@/lib/disney-holidays";
import { buildDisneyShowcaseSnapshot } from "@/lib/server/disney-public-preview";
import {
  predictCalendarMonth,
  clearCalendarMonthCache,
} from "@/lib/server/disney-calendar-prediction";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { DisneyCalendarMonth, DisneyParkKey, DisneyShowcaseSnapshot } from "@/lib/types/disney";

type CachedShowcase = {
  id: string;
  date: string;
  snapshot: DisneyShowcaseSnapshot;
  builtAt: string;
};

type CachedCalendar = {
  id: string;
  park: DisneyParkKey;
  year: number;
  month: number;
  payload: DisneyCalendarMonth;
  builtAt: string;
};

let memoryCache: { date: string; snapshot: DisneyShowcaseSnapshot; builtAt: number } | null =
  null;
const calendarMemory = new Map<string, { payload: DisneyCalendarMonth; builtAt: number }>();

const MEMORY_TTL_MS = 55 * 60 * 1000;
const CALENDAR_MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

function cacheDocId(date: string): string {
  return `public-showcase-${date}`;
}

function calendarDocId(park: DisneyParkKey, year: number, month: number): string {
  return `public-calendar-${park}-${year}-${String(month).padStart(2, "0")}`;
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

async function readCosmosCalendar(
  park: DisneyParkKey,
  year: number,
  month: number,
): Promise<DisneyCalendarMonth | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const id = calendarDocId(park, year, month);
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resource } = await container.item(id, id).read<CachedCalendar>();
    if (!resource?.payload) return null;
    if (resource.park !== park || resource.year !== year || resource.month !== month) {
      return null;
    }
    return resource.payload;
  } catch {
    return null;
  }
}

async function writeCosmosCalendar(
  park: DisneyParkKey,
  year: number,
  month: number,
  payload: DisneyCalendarMonth,
): Promise<void> {
  if (!isCosmosConfigured()) return;
  try {
    const id = calendarDocId(park, year, month);
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const doc: CachedCalendar = {
      id,
      park,
      year,
      month,
      payload,
      builtAt: new Date().toISOString(),
    };
    await container.items.upsert(doc);
  } catch {
    // ignore
  }
}

/**
 * オンライン表示専用。キャッシュが無ければ null（再計算しない）。
 */
export async function getDisneyShowcaseSnapshot(): Promise<DisneyShowcaseSnapshot | null> {
  const today = getJstToday();

  if (
    memoryCache?.date === today &&
    Date.now() - memoryCache.builtAt < MEMORY_TTL_MS
  ) {
    return memoryCache.snapshot;
  }

  const fromCosmos = await readCosmosCache(today);
  if (fromCosmos) {
    memoryCache = { date: today, snapshot: fromCosmos, builtAt: Date.now() };
    return fromCosmos;
  }

  return null;
}

/** 公開カレンダー。メモリ → Cosmos →（当月のみ）ショーケース内包。オンライン再計算しない。 */
export async function getPublicCalendarMonth(
  park: DisneyParkKey,
  year: number,
  month: number,
): Promise<DisneyCalendarMonth | null> {
  const key = `${park}:${year}-${month}`;
  const mem = calendarMemory.get(key);
  if (mem && Date.now() - mem.builtAt < CALENDAR_MEMORY_TTL_MS) {
    return mem.payload;
  }

  const fromCosmos = await readCosmosCalendar(park, year, month);
  if (fromCosmos) {
    calendarMemory.set(key, { payload: fromCosmos, builtAt: Date.now() });
    return fromCosmos;
  }

  const showcase = await getDisneyShowcaseSnapshot();
  const today = getJstToday();
  const now = new Date(`${today}T12:00:00+09:00`);
  if (
    showcase &&
    year === now.getFullYear() &&
    month === now.getMonth() + 1
  ) {
    const embedded = park === "tdl" ? showcase.tdl.calendarMonth : showcase.tds.calendarMonth;
    calendarMemory.set(key, { payload: embedded, builtAt: Date.now() });
    return embedded;
  }

  return null;
}

/** バッチ／cron 専用。ここでだけ重い再生成を行う。 */
export async function warmDisneyShowcaseCache(): Promise<{
  date: string;
  builtAt: string;
  calendarsWarmed: number;
}> {
  clearCalendarMonthCache();
  const snapshot = await buildDisneyShowcaseSnapshot({ skipLiveFetch: true });
  const today = getJstToday();
  memoryCache = { date: today, snapshot, builtAt: Date.now() };
  await writeCosmosCache(today, snapshot);

  const now = new Date(`${today}T12:00:00+09:00`);
  let calendarsWarmed = 0;
  const parks: DisneyParkKey[] = ["tdl", "tds"];
  for (const park of parks) {
    for (let offset = -1; offset <= 2; offset += 1) {
      const cursor = new Date(now);
      cursor.setMonth(cursor.getMonth() + offset);
      const year = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      try {
        const payload = await predictCalendarMonth(park, year, month, {
          skipLiveFetch: true,
        });
        const key = `${park}:${year}-${month}`;
        calendarMemory.set(key, { payload, builtAt: Date.now() });
        await writeCosmosCalendar(park, year, month, payload);
        calendarsWarmed += 1;
      } catch (error) {
        console.warn("[tdr-warm] calendar failed", park, year, month, error);
      }
    }
  }

  return {
    date: snapshot.today,
    builtAt: snapshot.generatedAt,
    calendarsWarmed,
  };
}
