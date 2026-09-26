import {
  ATTRACTION_NAME_JA,
  DISNEY_PARKS,
  POPULAR_ATTRACTIONS,
} from "@/lib/disney-constants";
import {
  USJ_ATTRACTION_NAME_JA,
  USJ_PARK,
  USJ_POPULAR_ATTRACTIONS,
} from "@/lib/usj-constants";
import type { AttractionWait, DisneyParkKey } from "@/lib/types/disney";
import type { ThemeParkKey } from "@/lib/types/theme-park";

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

function parkMeta(park: ThemeParkKey): {
  id: string;
  nameJa: string;
  popular: string[];
  nameJaMap: Record<string, string>;
} {
  if (park === "usj") {
    return {
      id: USJ_PARK.id,
      nameJa: USJ_PARK.nameJa,
      popular: USJ_POPULAR_ATTRACTIONS,
      nameJaMap: USJ_ATTRACTION_NAME_JA,
    };
  }
  return {
    id: DISNEY_PARKS[park].id,
    nameJa: DISNEY_PARKS[park].nameJa,
    popular: POPULAR_ATTRACTIONS[park],
    nameJaMap: ATTRACTION_NAME_JA,
  };
}

function isPopular(name: string, popular: string[]): boolean {
  const lower = name.toLowerCase();
  return popular.some((keyword) => lower.includes(keyword.toLowerCase()));
}

export async function fetchParkLiveData(
  park: ThemeParkKey,
): Promise<AttractionWait[]> {
  const meta = parkMeta(park);
  const res = await fetch(`${BASE_URL}/entity/${meta.id}/live`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`${meta.nameJa} の待ち時間を取得できませんでした`);
  }

  const data = (await res.json()) as { liveData?: LiveDataItem[] };

  return (data.liveData ?? [])
    .filter((item) => item.entityType === "ATTRACTION")
    .map((item) => ({
      id: item.id,
      name: item.name,
      nameJa: meta.nameJaMap[item.name],
      waitTime:
        typeof item.queue?.STANDBY?.waitTime === "number"
          ? item.queue.STANDBY.waitTime
          : null,
      status: item.status ?? "UNKNOWN",
      isPopular: isPopular(item.name, meta.popular),
      lastUpdated: item.lastUpdated ?? new Date().toISOString(),
    }))
    .sort((a, b) => (b.waitTime ?? -1) - (a.waitTime ?? -1));
}

export async function fetchParkSchedule(park: ThemeParkKey) {
  const meta = parkMeta(park);
  const res = await fetch(`${BASE_URL}/entity/${meta.id}/schedule`, {
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
    fetchParkLiveData("tdl" satisfies DisneyParkKey),
    fetchParkLiveData("tds" satisfies DisneyParkKey),
  ]);
  return { tdl, tds };
}

export async function fetchUsjLive() {
  return fetchParkLiveData("usj");
}
