/**
 * 予測 vs 実績の的中記録
 */
import { crowdLevelLabels } from "@/lib/disney-utils";
import {
  compareDateStr,
  getJstToday,
  getMonthDays,
  isHolidayEve,
  isJapanHoliday,
  parseJstDate,
} from "@/lib/disney-holidays";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import {
  getSnapshotsForDate,
  hasSufficientWaitSnapshots,
  MIN_WAIT_SAMPLES_FOR_ACCURACY,
  seedEmpiricalSnapshotsForDate,
  type DisneyWaitSnapshot,
} from "@/lib/server/disney-historical-store";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { CrowdLevel, DisneyParkKey } from "@/lib/types/disney";
import type {
  DisneyAccuracyActualSource,
  DisneyDayAccuracyRecord,
} from "@/lib/types/disney-accuracy";

/** カレンダー表示と同じ過去月数（disney-calendar-prediction と揃える） */
const DEFAULT_MONTHS_BACK = 2;

function scoreToCrowdLevel(score: number): CrowdLevel {
  if (score < 32) return "low";
  if (score < 52) return "moderate";
  if (score < 72) return "high";
  return "extreme";
}

function collectPredictionFactors(dateStr: string, park: DisneyParkKey): string[] {
  const { dayOfWeek } = parseJstDate(dateStr);
  const factors: string[] = [];
  if (isJapanHoliday(dateStr)) factors.push("祝日");
  if (isHolidayEve(dateStr)) factors.push("祝前日");
  if (dayOfWeek === 0) factors.push("日曜日");
  else if (dayOfWeek === 6) factors.push("土曜日");
  else if (dayOfWeek === 5) factors.push("金曜日");
  else factors.push("平日");

  const breakdown = buildCrowdBreakdown(dateStr, park);
  if (breakdown.labels.schoolK12 !== "小中高・通常期") factors.push(breakdown.labels.schoolK12);
  if (breakdown.labels.universityBreak !== "大学・通常期") {
    factors.push(breakdown.labels.universityBreak);
  }
  if (breakdown.labels.regionalPassport !== "通常チケット期") {
    factors.push(breakdown.labels.regionalPassport);
  }
  if (breakdown.labels.shareholderPassport !== "株主優待・平常") {
    factors.push(breakdown.labels.shareholderPassport);
  }
  if (breakdown.labels.otherThemeParks !== "他園・通常") {
    factors.push(breakdown.labels.otherThemeParks);
  }
  if (breakdown.labels.metroEvents !== "都内イベント平常") {
    factors.push(breakdown.labels.metroEvents);
  }
  if (breakdown.labels.disasterImpact !== "災害影響小") {
    factors.push(breakdown.labels.disasterImpact);
  }
  for (const label of breakdown.labels.historical.split("・")) {
    if (label.startsWith("自動見直")) factors.push(label);
  }
  return [...new Set(factors)];
}

function accuracyId(park: DisneyParkKey, date: string): string {
  return `acc-${park}-${date}`;
}

function levelFromAverageWait(averageWait: number): CrowdLevel {
  if (averageWait >= 70) return "extreme";
  if (averageWait >= 45) return "high";
  if (averageWait >= 25) return "moderate";
  return "low";
}

function levelToScore(level: CrowdLevel): number {
  const map: Record<CrowdLevel, number> = {
    low: 22,
    moderate: 42,
    high: 62,
    extreme: 82,
  };
  return map[level];
}

function levelRank(level: CrowdLevel): number {
  return { low: 0, moderate: 1, high: 2, extreme: 3 }[level];
}

function pickSnapshotSource(
  snapshots: DisneyWaitSnapshot[],
): { source: DisneyWaitSnapshot[]; actualSource: DisneyAccuracyActualSource } {
  const daytime = snapshots.filter((s) => s.hour >= 9 && s.hour <= 21);
  const pool = daytime.length > 0 ? daytime : snapshots;
  const live = pool.filter((s) => s.source !== "empirical-seed");
  if (hasSufficientWaitSnapshots(live)) {
    return { source: live, actualSource: "live-snapshots" };
  }
  return {
    source: pool,
    actualSource:
      live.length > 0 ? "live-snapshots" : "empirical-seed",
  };
}

/** 当日の待ち時間スナップショットから実績混雑を推定 */
export async function deriveActualCrowdFromSnapshots(
  park: DisneyParkKey,
  date: string,
): Promise<{
  level: CrowdLevel;
  score: number;
  averageWait: number;
  snapshotHours: number;
  actualSource: DisneyAccuracyActualSource;
} | null> {
  const snapshots = await getSnapshotsForDate(park, date);
  if (snapshots.length === 0) return null;

  const { source, actualSource } = pickSnapshotSource(snapshots);
  if (source.length === 0) return null;

  const waits: number[] = [];
  for (const snap of source) {
    for (const attr of snap.attractions) {
      if (typeof attr.waitTime === "number") waits.push(attr.waitTime);
    }
  }
  if (waits.length < MIN_WAIT_SAMPLES_FOR_ACCURACY) return null;

  const averageWait = Math.round(
    waits.reduce((sum, value) => sum + value, 0) / waits.length,
  );
  const level = levelFromAverageWait(averageWait);
  return {
    level,
    score: levelToScore(level),
    averageWait,
    snapshotHours: source.length,
    actualSource,
  };
}

export async function upsertDayAccuracy(
  park: DisneyParkKey,
  date: string,
): Promise<DisneyDayAccuracyRecord | null> {
  const today = getJstToday();
  if (compareDateStr(date, today) >= 0) return null;

  const actual = await deriveActualCrowdFromSnapshots(park, date);
  if (!actual) return null;

  const breakdown = buildCrowdBreakdown(date, park);
  const predictedScore = breakdown.total;
  const predictedLevel = scoreToCrowdLevel(predictedScore);
  const now = new Date().toISOString();
  const record: DisneyDayAccuracyRecord = {
    id: accuracyId(park, date),
    kind: "crowd-accuracy",
    park,
    date,
    predictedLevel,
    predictedScore,
    actualLevel: actual.level,
    actualScore: actual.score,
    actualAverageWait: actual.averageWait,
    scoreDelta: predictedScore - actual.score,
    levelHit: predictedLevel === actual.level,
    factors: collectPredictionFactors(date, park),
    snapshotHours: actual.snapshotHours,
    actualSource: actual.actualSource,
    createdAt: now,
    updatedAt: now,
  };

  if (!isCosmosConfigured()) return record;

  try {
    const container = await getDisneyRecordsContainer();
    try {
      const { resource } = await container
        .item(record.id, record.id)
        .read<DisneyDayAccuracyRecord>();
      if (resource?.createdAt) record.createdAt = resource.createdAt;
      // ライブ実績が入ったらシード評価を上書き。逆はしない。
      if (
        resource?.actualSource === "live-snapshots" &&
        record.actualSource === "empirical-seed"
      ) {
        return resource;
      }
    } catch {
      /* new */
    }
    await container.items.upsert(record);
  } catch (error) {
    console.warn("[disney-accuracy] upsert failed", error);
  }

  return record;
}

export async function finalizeYesterdayAccuracy(): Promise<{
  records: DisneyDayAccuracyRecord[];
}> {
  const today = getJstToday();
  const y = new Date(`${today}T12:00:00+09:00`);
  y.setDate(y.getDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);

  const records: DisneyDayAccuracyRecord[] = [];
  for (const park of ["tdl", "tds"] as DisneyParkKey[]) {
    await seedEmpiricalSnapshotsForDate(park, yesterday);
    const record = await upsertDayAccuracy(park, yesterday);
    if (record) records.push(record);
  }
  return { records };
}

/**
 * カレンダー表示範囲の過去日すべてをシード＋的中評価する。
 * ライブ未収集日は経験待ちシードで暫定評価し、「未評価」を解消する。
 */
export async function backfillPastAccuracy(options?: {
  monthsBack?: number;
  /** true なら既存的中レコードがある日はスキップ（warm 向け） */
  skipExisting?: boolean;
}): Promise<{
  seededDays: number;
  records: DisneyDayAccuracyRecord[];
}> {
  const monthsBack = options?.monthsBack ?? DEFAULT_MONTHS_BACK;
  const skipExisting = options?.skipExisting === true;
  const today = getJstToday();
  const cursor = new Date(`${today}T12:00:00+09:00`);
  const parks: DisneyParkKey[] = ["tdl", "tds"];
  let seededDays = 0;
  const records: DisneyDayAccuracyRecord[] = [];

  type Job = { park: DisneyParkKey; date: string };
  const jobs: Job[] = [];

  for (let offset = 0; offset <= monthsBack; offset += 1) {
    const monthCursor = new Date(cursor);
    monthCursor.setMonth(monthCursor.getMonth() - offset);
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth() + 1;
    const days = getMonthDays(year, month).filter(
      (dateStr) => compareDateStr(dateStr, today) < 0,
    );

    for (const park of parks) {
      const existing = skipExisting
        ? await getAccuracyMapForMonth(park, year, month)
        : null;
      for (const dateStr of days) {
        if (existing?.has(dateStr)) {
          const row = existing.get(dateStr);
          if (row) records.push(row);
          continue;
        }
        jobs.push({ park, date: dateStr });
      }
    }
  }

  const concurrency = 6;
  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async ({ park, date }) => {
        const seeded = await seedEmpiricalSnapshotsForDate(park, date);
        const record = await upsertDayAccuracy(park, date);
        return { seeded: seeded.seeded, record };
      }),
    );
    for (const row of chunkResults) {
      if (row.seeded) seededDays += 1;
      if (row.record) records.push(row.record);
    }
  }

  return { seededDays, records };
}

export async function listAccuracyForMonth(
  month: string,
  parks: DisneyParkKey[] = ["tdl", "tds"],
): Promise<DisneyDayAccuracyRecord[]> {
  if (!isCosmosConfigured()) return [];
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const endDate = new Date(Date.UTC(y, m, 1));
  const end = endDate.toISOString().slice(0, 10);

  try {
    const container = await getDisneyRecordsContainer();
    const { resources } = await container.items
      .query<DisneyDayAccuracyRecord>({
        query: `
          SELECT * FROM c
          WHERE c.kind = "crowd-accuracy"
            AND c.date >= @start AND c.date < @end
          ORDER BY c.date ASC
        `,
        parameters: [
          { name: "@start", value: start },
          { name: "@end", value: end },
        ],
      })
      .fetchAll();
    return resources.filter((row) => parks.includes(row.park));
  } catch {
    return [];
  }
}

export async function getAccuracyMapForMonth(
  park: DisneyParkKey,
  year: number,
  month: number,
): Promise<Map<string, DisneyDayAccuracyRecord>> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const rows = await listAccuracyForMonth(key, [park]);
  return new Map(rows.map((row) => [row.date, row]));
}

export function summarizeAccuracy(records: DisneyDayAccuracyRecord[]): {
  evaluatedDays: number;
  hits: number;
  hitRate: number;
  meanAbsScoreError: number;
} {
  if (records.length === 0) {
    return { evaluatedDays: 0, hits: 0, hitRate: 0, meanAbsScoreError: 0 };
  }
  const hits = records.filter((row) => row.levelHit).length;
  const mae =
    records.reduce((sum, row) => sum + Math.abs(row.scoreDelta), 0) /
    records.length;
  return {
    evaluatedDays: records.length,
    hits,
    hitRate: Math.round((hits / records.length) * 1000) / 10,
    meanAbsScoreError: Math.round(mae * 10) / 10,
  };
}

/** 月次自動見直し用: ライブ実績のみ */
export function summarizeLiveAccuracy(records: DisneyDayAccuracyRecord[]) {
  return summarizeAccuracy(
    records.filter((row) => row.actualSource !== "empirical-seed"),
  );
}

export function describeMiss(record: DisneyDayAccuracyRecord): string {
  const dir =
    levelRank(record.predictedLevel) > levelRank(record.actualLevel)
      ? "過大評価"
      : "過小評価";
  const topFactor = record.factors[0] ?? "要因不明";
  return `${topFactor}（${dir}: 予測${crowdLevelLabels[record.predictedLevel]}→実績${crowdLevelLabels[record.actualLevel]}）`;
}
