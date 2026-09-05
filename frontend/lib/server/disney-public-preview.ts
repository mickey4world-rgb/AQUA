import { compareDateStr, getJstToday } from "@/lib/disney-holidays";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { DISNEY_PARKS } from "@/lib/disney-constants";
import { upsertDayAccuracy } from "@/lib/server/disney-accuracy";
import { buildCharacterEveningAdvice } from "@/lib/server/disney-character-advice";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { predictCalendarMonth, predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import { buildDayForecast, getTomorrowJst } from "@/lib/server/disney-hourly-forecast";
import { seedEmpiricalSnapshotsForDate } from "@/lib/server/disney-historical-store";
import type {
  DisneyAdviceAccuracy,
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

async function resolvePastAccuracy(
  park: DisneyParkKey,
  date: string,
  today: string,
): Promise<DisneyAdviceAccuracy | null> {
  if (compareDateStr(date, today) >= 0) return null;

  await seedEmpiricalSnapshotsForDate(park, date);
  const record = await upsertDayAccuracy(park, date);
  if (!record) {
    return {
      levelHit: false,
      predictedLevel: predictCrowdForDate(park, date).crowdLevel,
      predictedScore: buildCrowdBreakdown(date, park).total,
      actualLevel: predictCrowdForDate(park, date).crowdLevel,
      actualScore: buildCrowdBreakdown(date, park).total,
      actualAverageWait: 0,
      scoreDelta: 0,
      pending: true,
      explanation:
        "この日の待ち時間スナップショットがまだ十分でないため、的中率は未評価です。予想スコアと混雑理由はそのまま参照できます。",
    };
  }

  const hitLabel = record.levelHit ? "的中" : "外れ";
  const deltaLabel =
    record.scoreDelta === 0
      ? "差なし"
      : record.scoreDelta > 0
        ? `予測が ${record.scoreDelta} 点高め`
        : `予測が ${Math.abs(record.scoreDelta)} 点低め`;

  return {
    levelHit: record.levelHit,
    predictedLevel: record.predictedLevel,
    predictedScore: record.predictedScore,
    actualLevel: record.actualLevel,
    actualScore: record.actualScore,
    actualAverageWait: record.actualAverageWait,
    scoreDelta: record.scoreDelta,
    explanation: `予想は「${crowdLevelLabels[record.predictedLevel]}」（${record.predictedScore}点）。実績は平均待ち約${record.actualAverageWait}分から「${crowdLevelLabels[record.actualLevel]}」（${record.actualScore}点）と推定 → ${hitLabel}（${deltaLabel}）${record.actualSource === "empirical-seed" ? "。※ライブ待ち収集前の日のため、過去傾向モデルで暫定評価しています" : ""}。月次で同じ外れ理由が続く条件は自動見直しし、的中率を上げていきます。`,
  };
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
  const isPast = compareDateStr(date, today) < 0;

  const [forecast, accuracy] = await Promise.all([
    buildDayForecast(park, date),
    isPast ? resolvePastAccuracy(park, date, today) : Promise.resolve(null),
  ]);

  const characterAdvice = buildCharacterEveningAdvice(
    park,
    date,
    dayContext,
    "preview",
    { accuracy },
  );

  return {
    date,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: crowdLevelLabels[prediction.crowdLevel],
    crowdScore: breakdown.total,
    breakdown,
    forecast,
    characterAdvice,
    isPast,
    accuracy,
  };
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
    buildPublicDayBriefing(park, today, {
      today,
      tomorrow,
      skipLiveFetch: options?.skipLiveFetch,
    }),
    buildPublicDayBriefing(park, tomorrow, {
      today,
      tomorrow,
      skipLiveFetch: options?.skipLiveFetch,
    }),
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
