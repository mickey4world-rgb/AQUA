import { getJstToday } from "@/lib/disney-holidays";
import { buildCharacterEveningAdvice } from "@/lib/server/disney-character-advice";
import { buildDayForecast, getTomorrowJst } from "@/lib/server/disney-hourly-forecast";
import { predictCalendarMonth, predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { DISNEY_PARKS } from "@/lib/disney-constants";
import { crowdLevelLabels } from "@/lib/disney-utils";
import type {
  DisneyDayBriefing,
  DisneyParkKey,
  DisneyParkPublicPreview,
  DisneyShowcaseSnapshot,
} from "@/lib/types/disney";

function resolveDayContext(
  date: string,
  today: string,
  tomorrow: string,
): "today" | "tomorrow" | "other" {
  if (date === today) return "today";
  if (date === tomorrow) return "tomorrow";
  return "other";
}

export async function buildPublicDayBriefing(
  park: DisneyParkKey,
  date: string,
  options?: { today?: string; tomorrow?: string; skipLiveFetch?: boolean },
): Promise<DisneyDayBriefing> {
  const today = options?.today ?? getJstToday();
  const tomorrow = options?.tomorrow ?? getTomorrowJst();
  const dayContext = resolveDayContext(date, today, tomorrow);
  const prediction = predictCrowdForDate(park, date);
  const breakdown = buildCrowdBreakdown(date, park);
  const [forecast, characterAdvice] = await Promise.all([
    buildDayForecast(park, date),
    Promise.resolve(buildCharacterEveningAdvice(park, date, dayContext, "preview")),
  ]);

  return {
    date,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: crowdLevelLabels[prediction.crowdLevel],
    crowdScore: breakdown.total,
    breakdown,
    forecast,
    characterAdvice,
  };
}

async function buildDayBriefing(
  park: DisneyParkKey,
  date: string,
  dayContext: "today" | "tomorrow",
): Promise<DisneyDayBriefing> {
  return buildPublicDayBriefing(park, date, {
    today: getJstToday(),
    tomorrow: getTomorrowJst(),
  });
}

async function buildParkPublicPreview(
  park: DisneyParkKey,
  today: string,
  tomorrow: string,
  options?: { skipLiveFetch?: boolean },
): Promise<DisneyParkPublicPreview> {
  const now = new Date(`${today}T12:00:00+09:00`);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [calendarMonth, todayBriefing, tomorrowBriefing] = await Promise.all([
    predictCalendarMonth(park, year, month, { skipLiveFetch: options?.skipLiveFetch }),
    buildDayBriefing(park, today, "today"),
    buildDayBriefing(park, tomorrow, "tomorrow"),
  ]);

  return {
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    calendarMonth,
    today: todayBriefing,
    tomorrow: tomorrowBriefing,
  };
}

export async function buildDisneyShowcaseSnapshot(options?: {
  skipLiveFetch?: boolean;
}): Promise<DisneyShowcaseSnapshot> {
  const today = getJstToday();
  const tomorrow = getTomorrowJst();
  const [tdl, tds] = await Promise.all([
    buildParkPublicPreview("tdl", today, tomorrow, options),
    buildParkPublicPreview("tds", today, tomorrow, options),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    today,
    tomorrow,
    tdl,
    tds,
    loginNotice:
      "リアルタイム待ち時間とキャラクターチャットはログイン後のダッシュボードでのみ利用できます。",
  };
}
