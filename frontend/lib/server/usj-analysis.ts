import { crowdLevelLabels } from "@/lib/disney-utils";
import { getJstToday } from "@/lib/disney-holidays";
import { fetchParkLiveData, fetchParkSchedule } from "@/lib/server/themeparks-api";
import { predictUsjCrowdForDate } from "@/lib/server/usj-calendar-prediction";
import { buildUsjCrowdBreakdown } from "@/lib/server/usj-crowd-breakdown";
import { recordUsjWaitSnapshot } from "@/lib/server/usj-historical-store";
import { USJ_PARK } from "@/lib/usj-constants";
import type {
  AttractionWait,
  CrowdLevel,
  DisneyAdvice,
  ParkCrowdStatus,
  TouringRecommendation,
} from "@/lib/types/disney";

function calcCrowdLevel(
  averageWait: number,
  extremeWaitCount: number,
  highWaitCount: number,
): CrowdLevel {
  // Disney反省: 閾値をやや厳しめにして「大混雑」誤爆を減らす
  if (averageWait >= 75 || extremeWaitCount >= 5) return "extreme";
  if (averageWait >= 48 || highWaitCount >= 8) return "high";
  if (averageWait >= 26 || highWaitCount >= 4) return "moderate";
  return "low";
}

function summarizeWaits(attractions: AttractionWait[]) {
  const operating = attractions.filter((item) => item.status === "OPERATING");
  const waits = operating
    .map((item) => item.waitTime)
    .filter((value): value is number => typeof value === "number");

  const averageWait =
    waits.length > 0 ? waits.reduce((sum, value) => sum + value, 0) / waits.length : 0;
  const sorted = [...waits].sort((a, b) => a - b);
  const medianWait = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const highWaitCount = waits.filter((value) => value >= 45).length;
  const extremeWaitCount = waits.filter((value) => value >= 75).length;

  return {
    operatingCount: operating.length,
    averageWait: Math.round(averageWait),
    medianWait,
    highWaitCount,
    extremeWaitCount,
  };
}

export async function buildUsjCrowdStatus(): Promise<ParkCrowdStatus> {
  const [attractions, schedule] = await Promise.all([
    fetchParkLiveData("usj"),
    fetchParkSchedule("usj"),
  ]);
  const stats = summarizeWaits(attractions);
  const crowdLevel = calcCrowdLevel(
    stats.averageWait,
    stats.extremeWaitCount,
    stats.highWaitCount,
  );
  const now = new Date();
  const isOpen = schedule
    ? now >= new Date(schedule.openingTime!) && now <= new Date(schedule.closingTime!)
    : true;

  return {
    park: "usj" as unknown as ParkCrowdStatus["park"],
    parkName: USJ_PARK.nameJa,
    crowdLevel,
    crowdLabel: crowdLevelLabels[crowdLevel],
    averageWait: stats.averageWait,
    medianWait: stats.medianWait,
    operatingCount: stats.operatingCount,
    highWaitCount: stats.highWaitCount,
    extremeWaitCount: stats.extremeWaitCount,
    fetchedAt: new Date().toISOString(),
    isOpen,
    openingTime: schedule?.openingTime,
    closingTime: schedule?.closingTime,
  };
}

function buildTouringPlan(attractions: AttractionWait[]): TouringRecommendation[] {
  const operating = attractions.filter(
    (a) => a.status === "OPERATING" && typeof a.waitTime === "number",
  );
  return operating.slice(0, 8).map((attraction) => {
    const wait = attraction.waitTime ?? 99;
    let priority: TouringRecommendation["priority"] = "later";
    let reason = "余裕があればどうぞ";
    if (attraction.isPopular && wait <= 30) {
      priority = "now";
      reason = "人気施設が短い今が狙い目";
    } else if (wait <= 20) {
      priority = "soon";
      reason = "待ちが短め";
    } else if (wait >= 75) {
      priority = "skip";
      reason = "長すぎるので後回し／エクスプレス検討";
    }
    return { priority, attraction, reason };
  });
}

export async function buildUsjAdvice(date?: string): Promise<DisneyAdvice> {
  const today = getJstToday();
  const targetDate = date ?? today;
  const prediction = predictUsjCrowdForDate(targetDate);
  const breakdown = buildUsjCrowdBreakdown(targetDate);

  if (targetDate !== today) {
    return {
      park: "usj" as unknown as DisneyAdvice["park"],
      parkName: USJ_PARK.nameJa,
      crowdLevel: prediction.crowdLevel,
      timeAdvice: [
        prediction.crowdLevel === "extreme" || prediction.crowdLevel === "high"
          ? "開園直後に任天堂／ハリー・ポッター系を優先"
          : "午前中に人気2〜3件、午後はショーと散策",
        "エクスプレスは長蛇の日だけ検討（過信しない）",
      ],
      seasonalAdvice: prediction.factors.slice(0, 3),
      touringPlan: [],
      summary: `${USJ_PARK.nameJa}の${targetDate}は「${prediction.crowdLabel}」見込み（スコア${prediction.crowdScore}）。${prediction.description}`,
      fetchedAt: new Date().toISOString(),
      targetDate,
      prediction,
      breakdown,
      accuracy: null,
    };
  }

  const [status, attractions] = await Promise.all([
    buildUsjCrowdStatus(),
    fetchParkLiveData("usj"),
  ]);
  void recordUsjWaitSnapshot(attractions).catch(() => undefined);

  return {
    park: "usj" as unknown as DisneyAdvice["park"],
    parkName: USJ_PARK.nameJa,
    crowdLevel: status.crowdLevel,
    timeAdvice: [
      status.crowdLevel === "extreme" || status.crowdLevel === "high"
        ? "いまは人気施設の待ちが伸びやすい。開園寄り or 夜寄りを意識"
        : "平均待ちに余裕あり。写真スポットも挟みやすい",
      `稼働中 ${status.operatingCount} / 平均待ち 約${status.averageWait}分`,
    ],
    seasonalAdvice: prediction.factors.slice(0, 3),
    touringPlan: buildTouringPlan(attractions),
    summary: `本日のUSJは「${status.crowdLabel}」（平均待ち約${status.averageWait}分）。予測スコアは ${prediction.crowdScore}。`,
    fetchedAt: new Date().toISOString(),
    targetDate: today,
    prediction: { ...prediction, mode: "live" },
    breakdown,
    accuracy: null,
  };
}

export function buildUsjForecastStatus(
  prediction: ReturnType<typeof predictUsjCrowdForDate>,
): ParkCrowdStatus {
  return {
    park: "usj" as unknown as ParkCrowdStatus["park"],
    parkName: USJ_PARK.nameJa,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: prediction.crowdLabel,
    averageWait: prediction.estimatedWait,
    medianWait: prediction.estimatedWait,
    operatingCount: 0,
    highWaitCount: 0,
    extremeWaitCount: 0,
    fetchedAt: new Date().toISOString(),
    isOpen: true,
  };
}
