import { getJstToday, shiftJstDate } from "@/lib/disney-holidays";
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
let rebuildInFlight: Promise<DisneyShowcaseSnapshot | null> | null = null;

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
  } catch (error) {
    console.warn("[tdr-cache] cosmos read failed", date, error);
    return null;
  }
}

async function writeCosmosCache(date: string, snapshot: DisneyShowcaseSnapshot): Promise<boolean> {
  if (!isCosmosConfigured()) {
    console.warn("[tdr-cache] cosmos not configured; snapshot will not persist across instances");
    return false;
  }
  const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
  const doc: CachedShowcase = {
    id: cacheDocId(date),
    date,
    snapshot,
    builtAt: new Date().toISOString(),
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await container.items.upsert(doc);
      return true;
    } catch (error) {
      console.error(`[tdr-cache] cosmos write failed (attempt ${attempt})`, date, error);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }
  return false;
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
  } catch (error) {
    console.warn("[tdr-cache] calendar read failed", park, year, month, error);
    return null;
  }
}

async function writeCosmosCalendar(
  park: DisneyParkKey,
  year: number,
  month: number,
  payload: DisneyCalendarMonth,
): Promise<boolean> {
  if (!isCosmosConfigured()) return false;
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
    return true;
  } catch (error) {
    console.error("[tdr-cache] calendar write failed", park, year, month, error);
    return false;
  }
}

async function rebuildShowcaseSnapshot(): Promise<DisneyShowcaseSnapshot | null> {
  if (rebuildInFlight) return rebuildInFlight;
  rebuildInFlight = (async () => {
    try {
      const snapshot = await buildDisneyShowcaseSnapshot({ skipLiveFetch: true });
      const today = getJstToday();
      memoryCache = { date: today, snapshot, builtAt: Date.now() };
      const written = await writeCosmosCache(today, snapshot);
      if (!written) {
        console.warn("[tdr-cache] rebuilt snapshot kept in memory only");
      }
      return snapshot;
    } catch (error) {
      console.error("[tdr-cache] rebuild failed", error);
      return null;
    } finally {
      rebuildInFlight = null;
    }
  })();
  return rebuildInFlight;
}

/**
 * 公開表示用。欠落時はローカル再生成 → 前日キャッシュの順でフォールバックし、
 * 「データなし 503」を極力出さない。
 */
export async function getDisneyShowcaseSnapshot(options?: {
  allowRebuild?: boolean;
}): Promise<DisneyShowcaseSnapshot | null> {
  const today = getJstToday();
  const allowRebuild = options?.allowRebuild !== false;

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

  if (allowRebuild) {
    console.warn("[tdr-cache] today's snapshot missing — rebuilding locally");
    const rebuilt = await rebuildShowcaseSnapshot();
    if (rebuilt) return rebuilt;
  }

  // 前日スナップショットでも空ページよりマシ（日付ずれに注意）
  const yesterday = shiftJstDate(today, -1);
  const stale = await readCosmosCache(yesterday);
  if (stale) {
    console.warn("[tdr-cache] serving stale snapshot from", yesterday);
    memoryCache = { date: today, snapshot: stale, builtAt: Date.now() };
    return stale;
  }

  return null;
}

/** 公開カレンダー。メモリ → Cosmos →（当月）ショーケース → 必要ならローカル再計算。 */
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

  const showcase = await getDisneyShowcaseSnapshot({ allowRebuild: false });
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

  try {
    const payload = await predictCalendarMonth(park, year, month, {
      skipLiveFetch: true,
    });
    calendarMemory.set(key, { payload, builtAt: Date.now() });
    await writeCosmosCalendar(park, year, month, payload);
    return payload;
  } catch (error) {
    console.error("[tdr-cache] calendar rebuild failed", park, year, month, error);
    return null;
  }
}

/** バッチ／cron 専用。ここでだけ重い再生成を行う。 */
export async function warmDisneyShowcaseCache(options?: {
  /** false ならショーケース永続化のみ（SWA タイムアウト回避の core） */
  includeCalendars?: boolean;
}): Promise<{
  date: string;
  builtAt: string;
  calendarsWarmed: number;
  cosmosPersisted: boolean;
  mode: "core" | "calendars";
}> {
  const includeCalendars = options?.includeCalendars === true;
  clearCalendarMonthCache();
  const started = Date.now();
  const snapshot = await buildDisneyShowcaseSnapshot({ skipLiveFetch: true });
  const today = getJstToday();
  memoryCache = { date: today, snapshot, builtAt: Date.now() };
  const cosmosPersisted = await writeCosmosCache(today, snapshot);
  if (!cosmosPersisted && isCosmosConfigured()) {
    throw new Error("TDR showcase snapshot could not be persisted to Cosmos");
  }

  // 当月カレンダーはショーケースに内包済み。別途メモリにも載せる
  const now = new Date(`${today}T12:00:00+09:00`);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  calendarMemory.set(`tdl:${currentYear}-${currentMonth}`, {
    payload: snapshot.tdl.calendarMonth,
    builtAt: Date.now(),
  });
  calendarMemory.set(`tds:${currentYear}-${currentMonth}`, {
    payload: snapshot.tds.calendarMonth,
    builtAt: Date.now(),
  });
  await Promise.all([
    writeCosmosCalendar("tdl", currentYear, currentMonth, snapshot.tdl.calendarMonth),
    writeCosmosCalendar("tds", currentYear, currentMonth, snapshot.tds.calendarMonth),
  ]);

  let calendarsWarmed = 2;
  if (includeCalendars) {
    const parks: DisneyParkKey[] = ["tdl", "tds"];
    for (const park of parks) {
      for (let offset = -1; offset <= 2; offset += 1) {
        if (offset === 0) continue; // 当月は上で済み
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
  }

  console.info(
    `[tdr-warm] ${includeCalendars ? "calendars" : "core"} done in ${Date.now() - started}ms`,
    { cosmosPersisted, calendarsWarmed },
  );

  return {
    date: snapshot.today,
    builtAt: snapshot.generatedAt,
    calendarsWarmed,
    cosmosPersisted,
    mode: includeCalendars ? "calendars" : "core",
  };
}
