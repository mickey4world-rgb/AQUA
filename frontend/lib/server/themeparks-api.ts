import {
  ATTRACTION_NAME_JA,
  DISNEY_PARKS,
  POPULAR_ATTRACTIONS,
} from "@/lib/disney-constants";
import type { AttractionWait, DisneyParkKey } from "@/lib/types/disney";

const BASE_URL = "https://api.themeparks.wiki/v1";

type LiveDataItem = {
  id: string;
  name: string;
  entityType?: string;
  status?: string;
  queue?: {
    STANDBY?: { waitTime?: number };
  };
  lastUpdated?: string;
};

type ScheduleItem = {
  date: string;
  type: string;
  openingTime?: string;
  closingTime?: string;
};

function isPopular(name: string, park: DisneyParkKey): boolean {
  return POPULAR_ATTRACTIONS[park].some((keyword) =>
    name.toLowerCase().includes(keyword.toLowerCase()),
  );
}

export async function fetchParkLiveData(
  park: DisneyParkKey,
): Promise<AttractionWait[]> {
  const parkId = DISNEY_PARKS[park].id;
  const res = await fetch(`${BASE_URL}/entity/${parkId}/live`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`${DISNEY_PARKS[park].nameJa} の待ち時間を取得できませんでした`);
  }

  const data = (await res.json()) as { liveData?: LiveDataItem[] };

  return (data.liveData ?? [])
    .filter((item) => item.entityType === "ATTRACTION")
    .map((item) => ({
      id: item.id,
      name: item.name,
      nameJa: ATTRACTION_NAME_JA[item.name],
      waitTime:
        typeof item.queue?.STANDBY?.waitTime === "number"
          ? item.queue.STANDBY.waitTime
          : null,
      status: item.status ?? "UNKNOWN",
      isPopular: isPopular(item.name, park),
      lastUpdated: item.lastUpdated ?? new Date().toISOString(),
    }))
    .sort((a, b) => (b.waitTime ?? -1) - (a.waitTime ?? -1));
}

export async function fetchParkSchedule(park: DisneyParkKey) {
  const parkId = DISNEY_PARKS[park].id;
  const res = await fetch(`${BASE_URL}/entity/${parkId}/schedule`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { schedule?: ScheduleItem[] };
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Tokyo",
  });

  return (
    data.schedule?.find((item) => item.date === today && item.type === "OPERATING") ??
    null
  );
}

export async function fetchBothParksLive() {
  const [tdl, tds] = await Promise.all([
    fetchParkLiveData("tdl"),
    fetchParkLiveData("tds"),
  ]);
  return { tdl, tds };
}
