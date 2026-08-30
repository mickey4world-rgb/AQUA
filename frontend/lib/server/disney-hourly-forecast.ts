import { DISNEY_PARKS, POPULAR_ATTRACTIONS } from "@/lib/disney-constants";
import { compareDateStr, getJstToday } from "@/lib/disney-holidays";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { getSnapshotsForDate } from "@/lib/server/disney-historical-store";
import { predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import type {
  AttractionCrowdBand,
  AttractionDayForecast,
  AttractionHourSlot,
  AttractionWait,
  DisneyDayForecast,
  DisneyParkKey,
} from "@/lib/types/disney";

const PARK_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

/** 時間帯別の混雑倍率（9時=0.0 … 21時=1.0 の正規化用） */
const HOURLY_CROWD_CURVE: Record<number, number> = {
  9: 0.35,
  10: 0.42,
  11: 0.58,
  12: 0.72,
  13: 0.78,
  14: 0.82,
  15: 0.88,
  16: 0.92,
  17: 0.95,
  18: 0.9,
  19: 0.82,
  20: 0.68,
  21: 0.52,
};

/** アトラクション別のピーク時間補正 */
const ATTRACTION_PEAK_HOUR: Record<string, Partial<Record<number, number>>> = {
  "Beauty and the Beast": { 10: 1.15, 11: 1.2, 15: 1.1 },
  Baymax: { 10: 1.1, 14: 1.15, 17: 1.1 },
  "Space Mountain": { 11: 1.1, 16: 1.15, 19: 1.12 },
  "Pooh's Hunny Hunt": { 10: 1.18, 11: 1.15 },
  "Journey to the Center of the Earth": { 10: 1.2, 11: 1.18, 15: 1.1 },
  "Tower of Terror": { 12: 1.1, 16: 1.15, 18: 1.12 },
  Soaring: { 11: 1.12, 14: 1.1 },
  Frozen: { 10: 1.15, 13: 1.12, 17: 1.1 },
};

function hourLabel(hour: number): string {
  return `${hour}:00`;
}

function waitToBand(minutes: number): AttractionCrowdBand {
  if (minutes <= 25) return "empty";
  if (minutes <= 50) return "moderate";
  if (minutes <= 80) return "busy";
  return "extreme";
}

function findAttractionMeta(
  park: DisneyParkKey,
  liveAttractions: AttractionWait[],
  keyword: string,
): AttractionWait | undefined {
  return liveAttractions.find((a) =>
    a.name.toLowerCase().includes(keyword.toLowerCase()),
  );
}

function estimateBaseWait(
  park: DisneyParkKey,
  date: string,
  keyword: string,
  isPopular: boolean,
): number {
  const prediction = predictCrowdForDate(park, date);
  const breakdownBoost = (prediction.crowdScore - 50) * 0.4;
  const popularBoost = isPopular ? 12 : 0;
  return Math.max(8, Math.round(prediction.estimatedWait + breakdownBoost + popularBoost));
}

function buildSlotsForAttraction(
  park: DisneyParkKey,
  date: string,
  keyword: string,
  meta: AttractionWait | undefined,
  historicalHourly: Map<number, number>,
  isToday: boolean,
  currentHour: number,
): AttractionHourSlot[] {
  const isPopular = meta?.isPopular ?? true;
  const base = meta?.waitTime ?? estimateBaseWait(park, date, keyword, isPopular);
  const peaks = ATTRACTION_PEAK_HOUR[keyword] ?? {};

  return PARK_HOURS.map((hour) => {
    const hist = historicalHourly.get(hour);
    const curve = HOURLY_CROWD_CURVE[hour] ?? 0.7;
    const peak = peaks[hour] ?? 1;
    let wait = hist ?? Math.round(base * curve * peak);

    if (isToday && hour < currentHour) {
      wait = hist ?? Math.round(base * curve * peak * 0.85);
    }
    if (isToday && hour === currentHour && meta?.waitTime != null) {
      wait = meta.waitTime;
    }

    wait = Math.max(5, Math.min(150, wait));
    return {
      hour,
      label: hourLabel(hour),
      waitMinutes: wait,
      band: waitToBand(wait),
    };
  });
}

export async function buildDayForecast(
  park: DisneyParkKey,
  date: string,
  liveAttractions: AttractionWait[] = [],
): Promise<DisneyDayForecast> {
  const today = getJstToday();
  const isToday = date === today;
  const currentHour = Number(
    new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Tokyo",
    }),
  );

  const snapshots = await getSnapshotsForDate(park, date);
  const historicalByAttraction = new Map<string, Map<number, number>>();

  for (const snap of snapshots) {
    for (const attr of snap.attractions) {
      if (attr.waitTime == null) continue;
      const key = attr.name;
      if (!historicalByAttraction.has(key)) {
        historicalByAttraction.set(key, new Map());
      }
      const hourMap = historicalByAttraction.get(key)!;
      const prev = hourMap.get(snap.hour);
      const next = prev == null ? attr.waitTime : Math.round((prev + attr.waitTime) / 2);
      hourMap.set(snap.hour, next);
    }
  }

  const keywords = POPULAR_ATTRACTIONS[park];
  const attractions: AttractionDayForecast[] = keywords.map((keyword) => {
    const meta = findAttractionMeta(park, liveAttractions, keyword);
    const histMap =
      historicalByAttraction.get(meta?.name ?? keyword) ??
      historicalByAttraction.get(keyword) ??
      new Map<number, number>();

    const slots = buildSlotsForAttraction(
      park,
      date,
      keyword,
      meta,
      histMap,
      isToday,
      currentHour,
    );

    const sorted = [...slots].sort((a, b) => a.waitMinutes - b.waitMinutes);
    const bestHours = sorted.slice(0, 3).map((s) => s.hour);
    const worstHours = sorted.slice(-3).map((s) => s.hour).reverse();

    return {
      id: meta?.id ?? keyword,
      name: meta?.name ?? keyword,
      nameJa: meta?.nameJa ?? keyword,
      isPopular: meta?.isPopular ?? true,
      slots,
      bestHours,
      worstHours,
    };
  });

  const hourTotals = PARK_HOURS.map((hour) => {
    const sum = attractions.reduce(
      (acc, attr) => acc + (attr.slots.find((s) => s.hour === hour)?.waitMinutes ?? 0),
      0,
    );
    return { hour, avg: sum / Math.max(attractions.length, 1) };
  });

  const quietest = [...hourTotals].sort((a, b) => a.avg - b.avg)[0]!;
  const busiest = [...hourTotals].sort((a, b) => b.avg - a.avg)[0]!;

  return {
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    date,
    mode: isToday ? "live" : compareDateStr(date, today) > 0 ? "forecast" : "forecast",
    hours: PARK_HOURS,
    hourLabels: PARK_HOURS.map(hourLabel),
    attractions,
    summary: {
      quietestHour: quietest.hour,
      busiestHour: busiest.hour,
      quietestLabel: hourLabel(quietest.hour),
      busiestLabel: hourLabel(busiest.hour),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function getTomorrowJst(): string {
  const today = new Date(`${getJstToday()}T12:00:00+09:00`);
  today.setDate(today.getDate() + 1);
  return today.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
