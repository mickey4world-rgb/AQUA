/**
 * Travel 地点の天気・環境（Open-Meteo）
 * - 過去日: archive（実測系）→ 一度取れたら原則保持
 * - 当日〜予報枠: forecast（更新可）
 */
import type { TravelStop, TravelStopWeather } from "@/lib/types/travel";
import { formatTravelWeatherLine } from "@/lib/travel-weather-format";

// re-export for server callers that want a one-liner
export { formatTravelWeatherLine };

const WMO_JA: Record<number, string> = {
  0: "快晴",
  1: "おおむね晴れ",
  2: "ところにより曇り",
  3: "曇り",
  45: "霧",
  48: "着氷性の霧",
  51: "霧雨（弱）",
  53: "霧雨",
  55: "霧雨（強）",
  61: "雨（弱）",
  63: "雨",
  65: "雨（強）",
  71: "雪（弱）",
  73: "雪",
  75: "雪（強）",
  80: "にわか雨（弱）",
  81: "にわか雨",
  82: "にわか雨（強）",
  95: "雷雨",
  96: "雷雨（ひょう）",
  99: "激しい雷雨",
};

const DAILY_VARS =
  "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean,wind_speed_10m_max,uv_index_max";

function weatherLabel(code: number | undefined): string {
  if (code == null || Number.isNaN(code)) return "不明";
  return WMO_JA[code] ?? `天候コード ${code}`;
}

/** YYYY-MM-DD in Asia/Tokyo */
export function todayJstDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

type DailyPayload = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_sum?: number[];
  precipitation_probability_max?: number[];
  relative_humidity_2m_mean?: number[];
  wind_speed_10m_max?: number[];
  uv_index_max?: number[];
};

function pickDaily(
  daily: DailyPayload | undefined,
  date: string,
  source: TravelStopWeather["source"],
): TravelStopWeather | null {
  const idx = daily?.time?.findIndex((t) => t === date) ?? -1;
  if (idx < 0) return null;
  const code = daily?.weather_code?.[idx];
  return {
    date,
    source,
    label: weatherLabel(code),
    weatherCode: code,
    tempMaxC: daily?.temperature_2m_max?.[idx],
    tempMinC: daily?.temperature_2m_min?.[idx],
    humidityPct: daily?.relative_humidity_2m_mean?.[idx],
    precipMm: daily?.precipitation_sum?.[idx],
    precipProbPct: daily?.precipitation_probability_max?.[idx],
    windMaxKmh: daily?.wind_speed_10m_max?.[idx],
    uvIndexMax: daily?.uv_index_max?.[idx],
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchOpenMeteoDaily(url: string): Promise<DailyPayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { daily?: DailyPayload };
    return data.daily ?? null;
  } catch (error) {
    console.warn("[travel-weather] fetch failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWeatherForPoint(input: {
  lat: number;
  lon: number;
  date: string;
}): Promise<TravelStopWeather | null> {
  if (!isIsoDate(input.date)) return null;
  const today = todayJstDateString();
  const forecastHorizon = addDaysIso(today, 15);

  if (input.date < today) {
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${input.lat}&longitude=${input.lon}` +
      `&start_date=${input.date}&end_date=${input.date}` +
      `&daily=${DAILY_VARS}&timezone=Asia%2FTokyo`;
    const daily = await fetchOpenMeteoDaily(url);
    return pickDaily(daily ?? undefined, input.date, "archive");
  }

  if (input.date > forecastHorizon) {
    return null;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${input.lat}&longitude=${input.lon}` +
    `&start_date=${input.date}&end_date=${input.date}` +
    `&daily=${DAILY_VARS}&timezone=Asia%2FTokyo`;
  const daily = await fetchOpenMeteoDaily(url);
  return pickDaily(daily ?? undefined, input.date, "forecast");
}

/**
 * 各地点に天気を付与。
 * 過去（archive）が既にある場合は force 以外で上書きしない（実情報の保管）。
 */
export async function attachWeatherToStops(
  stops: TravelStop[],
  options?: { force?: boolean; tripStartDate?: string; tripEndDate?: string },
): Promise<{ stops: TravelStop[]; updated: number; failed: number }> {
  const force = options?.force === true;
  let updated = 0;
  let failed = 0;
  const next: TravelStop[] = [];

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i]!;
    const date =
      (isIsoDate(stop.date) && stop.date) ||
      (isIsoDate(options?.tripStartDate) && options?.tripStartDate) ||
      undefined;

    if (
      !force &&
      stop.weather?.source === "archive" &&
      stop.weather.date &&
      (!date || stop.weather.date === date)
    ) {
      next.push(stop);
      continue;
    }

    if (
      typeof stop.lat !== "number" ||
      typeof stop.lon !== "number" ||
      !date
    ) {
      next.push(stop);
      continue;
    }

    if (i > 0) await new Promise((r) => setTimeout(r, 120));
    const weather = await fetchWeatherForPoint({
      lat: stop.lat,
      lon: stop.lon,
      date,
    });
    if (!weather) {
      failed += 1;
      next.push(stop);
      continue;
    }
    updated += 1;
    next.push({ ...stop, date, weather });
  }

  return { stops: next, updated, failed };
}
