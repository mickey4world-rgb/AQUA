import { POPULAR_ATTRACTIONS } from "@/lib/disney-constants";
import { getJstToday } from "@/lib/disney-holidays";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { AttractionWait, DisneyParkKey } from "@/lib/types/disney";

export type DisneyWaitSnapshot = {
  id: string;
  park: DisneyParkKey;
  date: string;
  hour: number;
  recordedAt: string;
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
const MEMORY_LIMIT = 800;

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

export async function recordWaitSnapshot(
  park: DisneyParkKey,
  attractions: AttractionWait[],
): Promise<void> {
  const today = getJstToday();
  const hour = getJstHour();
  const id = snapshotId(park, today, hour);

  const snapshot: DisneyWaitSnapshot = {
    id,
    park,
    date: today,
    hour,
    recordedAt: new Date().toISOString(),
    attractions: attractions
      .filter((a) => a.status === "OPERATING")
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

  if (!isCosmosConfigured()) return;

  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    await container.items.upsert(snapshot);
  } catch {
    // 記録失敗は本番体験を止めない
  }
}

export async function getSnapshotsForDate(
  park: DisneyParkKey,
  date: string,
): Promise<DisneyWaitSnapshot[]> {
  const prefix = `wait-${park}-${date}-`;
  const fromMemory = [...memorySnapshots.values()].filter((s) => s.id.startsWith(prefix));

  if (!isCosmosConfigured()) {
    return fromMemory.sort((a, b) => a.hour - b.hour);
  }

  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resources } = await container.items
      .query<DisneyWaitSnapshot>({
        query:
          "SELECT * FROM c WHERE STARTSWITH(c.id, @prefix) ORDER BY c.hour ASC",
        parameters: [{ name: "@prefix", value: prefix }],
      })
      .fetchAll();

    const merged = new Map<string, DisneyWaitSnapshot>();
    for (const row of resources) merged.set(row.id, row);
    for (const row of fromMemory) merged.set(row.id, row);
    return [...merged.values()].sort((a, b) => a.hour - b.hour);
  } catch {
    return fromMemory.sort((a, b) => a.hour - b.hour);
  }
}

export function getDefaultAttractionKeys(park: DisneyParkKey): string[] {
  return POPULAR_ATTRACTIONS[park];
}
