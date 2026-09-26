/**
 * USJ 待ち時間スナップショット（Disney反省: ライブ実績を的中学習の正とする）
 */
import { getJstToday } from "@/lib/disney-holidays";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { AttractionWait } from "@/lib/types/disney";

export type UsjWaitSnapshot = {
  id: string;
  kind: "usj-wait-snapshot";
  park: "usj";
  date: string;
  hour: number;
  recordedAt: string;
  source: "live";
  attractions: Array<{
    id: string;
    name: string;
    nameJa?: string;
    waitTime: number | null;
    isPopular: boolean;
  }>;
};

const memorySnapshots = new Map<string, UsjWaitSnapshot>();

export async function recordUsjWaitSnapshot(
  attractions: AttractionWait[],
): Promise<void> {
  const date = getJstToday();
  const hour = Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    }),
  );
  const snap: UsjWaitSnapshot = {
    id: `usj-wait-${date}-${hour}`,
    kind: "usj-wait-snapshot",
    park: "usj",
    date,
    hour,
    recordedAt: new Date().toISOString(),
    source: "live",
    attractions: attractions.map((a) => ({
      id: a.id,
      name: a.name,
      nameJa: a.nameJa,
      waitTime: a.waitTime,
      isPopular: a.isPopular,
    })),
  };
  memorySnapshots.set(snap.id, snap);
  if (!isCosmosConfigured()) return;
  try {
    const container = await getDisneyRecordsContainer();
    await container.items.upsert(snap);
  } catch (error) {
    console.warn("[usj-historical] snapshot save failed", error);
  }
}
