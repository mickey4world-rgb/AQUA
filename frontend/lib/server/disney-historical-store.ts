/**
 * 待ち時間スナップショット保管（的中率の実績根拠）
 */
import { POPULAR_ATTRACTIONS } from "@/lib/disney-constants";
import {
  getJstToday,
  isHolidayEve,
  isJapanHoliday,
  parseJstDate,
} from "@/lib/disney-holidays";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { fetchParkLiveData } from "@/lib/server/themeparks-api";
import type { AttractionWait, DisneyParkKey } from "@/lib/types/disney";

export type WaitSnapshotSource = "live" | "empirical-seed";

export type DisneyWaitSnapshot = {
  id: string;
  kind: "wait-snapshot";
  park: DisneyParkKey;
  date: string;
  hour: number;
  recordedAt: string;
  source: WaitSnapshotSource;
  attractions: Array<{
    id: string;
    name: string;
    nameJa?: string;
    waitTime: number | null;
    isPopular: boolean;
  }>;
};

/** インスタンス内フォールバック（Cosmos 未設定時） */
const memorySnapshots = new Map<string, DisneyWaitSnapshot>();
const MEMORY_LIMIT = 2000;

/** 的中評価に必要な最低待ち分数サンプル */
export const MIN_WAIT_SAMPLES_FOR_ACCURACY = 4;

function snapshotId(park: DisneyParkKey, date: string, hour: number): string {
  return `wait-${park}-${date}-${String(hour).padStart(2, "0")}`;
}

function getJstHour(): number {
  return Number(
    new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Tokyo",
    }),
  );
}

function normalizeSnapshot(row: DisneyWaitSnapshot): DisneyWaitSnapshot {
  return {
    ...row,
    kind: "wait-snapshot",
    source: row.source === "empirical-seed" ? "empirical-seed" : "live",
  };
}

/** 昼帯（9–21時）のスナップショットから待ち分数を集計できるか */
export function countWaitSamples(snapshots: DisneyWaitSnapshot[]): {
  daytimeHours: number;
  waitSamples: number;
  liveHours: number;
} {
  const daytime = snapshots.filter((s) => s.hour >= 9 && s.hour <= 21);
  const source = daytime.length > 0 ? daytime : snapshots;
  let waitSamples = 0;
  for (const snap of source) {
    for (const attr of snap.attractions) {
      if (typeof attr.waitTime === "number") waitSamples += 1;
    }
  }
  return {
    daytimeHours: source.length,
    waitSamples,
    liveHours: source.filter((s) => s.source !== "empirical-seed").length,
  };
}

export function hasSufficientWaitSnapshots(snapshots: DisneyWaitSnapshot[]): boolean {
  return countWaitSamples(snapshots).waitSamples >= MIN_WAIT_SAMPLES_FOR_ACCURACY;
}

export async function recordWaitSnapshot(
  park: DisneyParkKey,
  attractions: AttractionWait[],
  options?: { date?: string; hour?: number; source?: WaitSnapshotSource },
): Promise<DisneyWaitSnapshot> {
  const date = options?.date ?? getJstToday();
  const hour = options?.hour ?? getJstHour();
  const source = options?.source ?? "live";
  const id = snapshotId(park, date, hour);

  const snapshot: DisneyWaitSnapshot = {
    id,
    kind: "wait-snapshot",
    park,
    date,
    hour,
    recordedAt: new Date().toISOString(),
    source,
    attractions: attractions
      .filter((a) => a.status === "OPERATING" || source === "empirical-seed")
      .map((a) => ({
        id: a.id,
        name: a.name,
        nameJa: a.nameJa,
        waitTime: a.waitTime,
        isPopular: a.isPopular,
      })),
  };

  memorySnapshots.set(id, snapshot);
  if (memorySnapshots.size > MEMORY_LIMIT) {
    const oldest = [...memorySnapshots.keys()][0];
    if (oldest) memorySnapshots.delete(oldest);
  }

  if (!isCosmosConfigured()) return snapshot;

  try {
    const container = await getDisneyRecordsContainer();
    // ライブがある時間帯はシードで上書きしない
    if (source === "empirical-seed") {
      try {
        const { resource } = await container.item(id, id).read<DisneyWaitSnapshot>();
        if (resource && resource.source !== "empirical-seed") {
          return normalizeSnapshot(resource);
        }
      } catch {
        /* new */
      }
    }
    await container.items.upsert(snapshot);
  } catch (error) {
    console.warn("[disney-historical-store] upsert failed", park, date, hour, error);
  }

  return snapshot;
}

export async function getSnapshotsForDate(
  park: DisneyParkKey,
  date: string,
): Promise<DisneyWaitSnapshot[]> {
  const prefix = `wait-${park}-${date}-`;
  const fromMemory = [...memorySnapshots.values()]
    .filter((s) => s.id.startsWith(prefix))
    .map(normalizeSnapshot);

  if (!isCosmosConfigured()) {
    return fromMemory.sort((a, b) => a.hour - b.hour);
  }

  try {
    const container = await getDisneyRecordsContainer();
    const { resources } = await container.items
      .query<DisneyWaitSnapshot>({
        query:
          "SELECT * FROM c WHERE STARTSWITH(c.id, @prefix) ORDER BY c.hour ASC",
        parameters: [{ name: "@prefix", value: prefix }],
      })
      .fetchAll();

    const merged = new Map<string, DisneyWaitSnapshot>();
    for (const row of resources) merged.set(row.id, normalizeSnapshot(row));
    for (const row of fromMemory) merged.set(row.id, row);
    return [...merged.values()].sort((a, b) => a.hour - b.hour);
  } catch {
    return fromMemory.sort((a, b) => a.hour - b.hour);
  }
}

export function getDefaultAttractionKeys(park: DisneyParkKey): string[] {
  return POPULAR_ATTRACTIONS[park];
}

/**
 * 予測モデルとは独立した DOW／祝日ベースの経験待ち時間（分）。
 * ライブ未収集の過去日を暫定評価するために使う。
 */
export function empiricalWaitMinutes(
  dateStr: string,
  park: DisneyParkKey,
  hour: number,
): number {
  const { dayOfWeek, month } = parseJstDate(dateStr);
  let base = park === "tdl" ? 28 : 26;

  if (dayOfWeek === 0) base += 22;
  else if (dayOfWeek === 6) base += 18;
  else if (dayOfWeek === 5) base += 10;
  else if (dayOfWeek === 1) base -= 4;

  if (isJapanHoliday(dateStr)) base += 24;
  if (isHolidayEve(dateStr)) base += 12;

  if (month === 8) base += 10;
  if (month === 3 || month === 4) base += 6;
  if (month === 11 || month === 1) base -= 4;

  let hourBoost = 0;
  if (hour >= 11 && hour <= 15) hourBoost = 16;
  else if (hour >= 16 && hour <= 18) hourBoost = 10;
  else if (hour === 10 || hour === 19) hourBoost = 4;

  return Math.max(5, Math.min(120, Math.round(base + hourBoost)));
}

function buildEmpiricalAttractions(
  park: DisneyParkKey,
  dateStr: string,
  hour: number,
): AttractionWait[] {
  const wait = empiricalWaitMinutes(dateStr, park, hour);
  return POPULAR_ATTRACTIONS[park].map((keyword, index) => {
    const jitter = ((index % 5) - 2) * 3;
    return {
      id: `empirical-${park}-${keyword}`,
      name: keyword,
      nameJa: keyword,
      waitTime: Math.max(5, wait + jitter),
      status: "OPERATING",
      isPopular: true,
      lastUpdated: `${dateStr}T${String(hour).padStart(2, "0")}:00:00+09:00`,
    };
  });
}

/** ライブが足りない過去日へ、評価可能な経験シードを書き込む */
export async function seedEmpiricalSnapshotsForDate(
  park: DisneyParkKey,
  date: string,
): Promise<{ seeded: boolean; hours: number }> {
  const existing = await getSnapshotsForDate(park, date);
  const liveOnly = existing.filter((s) => s.source !== "empirical-seed");
  if (hasSufficientWaitSnapshots(liveOnly) || hasSufficientWaitSnapshots(existing)) {
    return { seeded: false, hours: 0 };
  }

  const hours = [10, 12, 14, 16, 18];
  for (const hour of hours) {
    await recordWaitSnapshot(park, buildEmpiricalAttractions(park, date, hour), {
      date,
      hour,
      source: "empirical-seed",
    });
  }
  return { seeded: true, hours: hours.length };
}

/** 両園のライブ待ちを取得して現在時のスナップショットを保存 */
export async function collectLiveWaitSnapshotsNow(): Promise<{
  parks: DisneyParkKey[];
  hour: number;
  date: string;
  attractionCounts: Record<string, number>;
}> {
  const date = getJstToday();
  const hour = getJstHour();
  const parks: DisneyParkKey[] = ["tdl", "tds"];
  const attractionCounts: Record<string, number> = {};

  await Promise.all(
    parks.map(async (park) => {
      const attractions = await fetchParkLiveData(park);
      await recordWaitSnapshot(park, attractions, { date, hour, source: "live" });
      attractionCounts[park] = attractions.filter(
        (a) => a.status === "OPERATING" && typeof a.waitTime === "number",
      ).length;
    }),
  );

  return { parks, hour, date, attractionCounts };
}
