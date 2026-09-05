import { crowdLevelLabels } from "@/lib/disney-utils";
import { getJstToday } from "@/lib/disney-holidays";
import { DISNEY_PARKS } from "@/lib/disney-constants";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import { upsertDayAccuracy } from "@/lib/server/disney-accuracy";
import { fetchParkLiveData, fetchParkSchedule } from "@/lib/server/themeparks-api";
import type {
  AttractionWait,
  CrowdLevel,
  DisneyAdvice,
  DisneyAdviceAccuracy,
  DisneyParkKey,
  DisneyResortStatus,
  ParkCrowdStatus,
  TouringRecommendation,
} from "@/lib/types/disney";

function calcCrowdLevel(
  averageWait: number,
  extremeWaitCount: number,
  highWaitCount: number,
): CrowdLevel {
  if (averageWait >= 70 || extremeWaitCount >= 5) return "extreme";
  if (averageWait >= 45 || highWaitCount >= 8) return "high";
  if (averageWait >= 25 || highWaitCount >= 4) return "moderate";
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
  const medianWait =
    sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
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

export async function buildParkCrowdStatus(
  park: DisneyParkKey,
): Promise<ParkCrowdStatus> {
  const [attractions, schedule] = await Promise.all([
    fetchParkLiveData(park),
    fetchParkSchedule(park),
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
    park,
    parkName: DISNEY_PARKS[park].nameJa,
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

export async function buildResortStatus(): Promise<DisneyResortStatus> {
  const [tdl, tds] = await Promise.all([
    buildParkCrowdStatus("tdl"),
    buildParkCrowdStatus("tds"),
  ]);

  const levelRank = { low: 0, moderate: 1, high: 2, extreme: 3 };
  const overallCrowdLevel =
    levelRank[tdl.crowdLevel] >= levelRank[tds.crowdLevel]
      ? tdl.crowdLevel
      : tds.crowdLevel;

  return {
    tdl,
    tds,
    overallCrowdLevel,
    overallLabel: crowdLevelLabels[overallCrowdLevel],
    fetchedAt: new Date().toISOString(),
  };
}

function getJstContext(forDate?: string) {
  const base = forDate
    ? new Date(`${forDate}T12:00:00+09:00`)
    : new Date();
  const jst = new Date(base.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const hour = forDate ? 9 : jst.getHours();
  const day = jst.getDay();
  const month = jst.getMonth() + 1;
  const date = jst.getDate();
  return { hour, day, month, date, jst };
}

export function buildTimeAdvice(
  park: DisneyParkKey,
  crowdLevel: CrowdLevel,
  forDate?: string,
): string[] {
  const { hour } = getJstContext(forDate);
  const tips: string[] = [];

  if (forDate && forDate !== getJstToday()) {
    tips.push("来園日は開園直後〜11時が人気アトラクションの優先時間帯になりやすいです。");
    tips.push("昼食時間（11:30〜13:30）は待ち時間が伸びやすいため、食事かアトラクションのどちらかに集中しましょう。");
    tips.push("夕方〜閉園前は再び混雑する日もあるため、必須アトラクションは午前中に済ませるのが安心です。");
  } else if (hour < 10) {
    tips.push("開園直後は人気アトラクション（美女と野獣、ベイマックス等）を最優先に。");
  } else if (hour < 13) {
    tips.push("午前中はショー・パレード時間帯を避け、アトラクションを効率よく回れます。");
  } else if (hour < 16) {
    tips.push("昼食時間帯は待ち時間が下がるアトラクションも。再エントリー枠も検討。");
  } else if (hour < 19) {
    tips.push("夕方以降は人気アトラクションの待ち時間が再び伸びやすい時間帯です。");
  } else {
    tips.push("閉園前はショップ・短い待ちのアトラクションが狙い目。パレード前後は移動に注意。");
  }

  if (crowdLevel === "extreme" || crowdLevel === "high") {
    tips.push("混雑時は1つのエリアに留まり、近接アトラクションを優先すると移動ロスが減ります。");
  }

  if (park === "tds") {
    tips.push("ディズニーシーはエリア間の移動が多いため、地図でルートを先に決めると効率的です。");
  }

  return tips;
}

export function buildSeasonalAdvice(forDate?: string): string[] {
  const { day, month } = getJstContext(forDate);
  const tips: string[] = [];

  if (day === 0 || day === 6) {
    tips.push("週末は平日より待ち時間が長くなる傾向があります。可能なら平日来園がおすすめ。");
  } else {
    tips.push("平日は比較的空きやすい傾向。祝日・連休前後は例外的に混みます。");
  }

  if (month === 3 || month === 4) {
    tips.push("春休み・GW前後は年間でも混雑しやすい時期です。早朝来園が有効。");
  } else if (month === 7 || month === 8) {
    tips.push("夏休みシーズンは午前中でも混雑。水分補給と日陰休憩を挟みながら回りましょう。");
  } else if (month === 12) {
    tips.push("年末年始・クリスマスシーズンは夜のショー・イルミネーション目的の来園者が増えます。");
  } else if (month === 1 || month === 2) {
    tips.push("1〜2月は比較的落ち着く日が多いですが、イベント日は例外です。");
  }

  tips.push("雨の日は待ち時間が下がることがあります（屋内アトラクション中心に）。");
  return tips;
}

export function buildTouringPlan(
  attractions: AttractionWait[],
): TouringRecommendation[] {
  const operating = attractions.filter(
    (item) => item.status === "OPERATING" && item.waitTime !== null,
  );

  return operating
    .map((attraction) => {
      const wait = attraction.waitTime ?? 999;
      let priority: TouringRecommendation["priority"] = "later";
      let reason = "待ち時間が長いため後回しが無難です。";

      if (wait <= 20) {
        priority = "now";
        reason = attraction.isPopular
          ? "人気アトラクションで待ち時間が短い今がチャンスです。"
          : "待ち時間が短く、今すぐ乗車しやすい状態です。";
      } else if (wait <= 40) {
        priority = "soon";
        reason = "許容範囲の待ち時間。近くのエリアを回りつつ優先候補に。";
      } else if (wait <= 70) {
        priority = "later";
        reason = "混雑が落ち着く時間帯まで後回しにするのがおすすめ。";
      } else {
        priority = "skip";
        reason = "待ち時間が非常に長いです。ショー時間や他エリアを先に。";
      }

      return { priority, attraction, reason };
    })
    .sort((a, b) => {
      const order = { now: 0, soon: 1, later: 2, skip: 3 };
      const waitDiff = (a.attraction.waitTime ?? 999) - (b.attraction.waitTime ?? 999);
      if (order[a.priority] !== order[b.priority]) {
        return order[a.priority] - order[b.priority];
      }
      if (a.attraction.isPopular !== b.attraction.isPopular) {
        return a.attraction.isPopular ? -1 : 1;
      }
      return waitDiff;
    })
    .slice(0, 12);
}

export async function buildDisneyAdvice(
  park: DisneyParkKey,
  targetDate?: string,
): Promise<DisneyAdvice> {
  const today = getJstToday();
  const date = targetDate ?? today;

  if (date !== today) {
    const { loadCrowdAdjustments } = await import(
      "@/lib/server/disney-crowd-adjustments"
    );
    await loadCrowdAdjustments();

    const prediction = predictCrowdForDate(park, date);
    const breakdown = buildCrowdBreakdown(date, park);
    let accuracy: DisneyAdviceAccuracy | null = null;

    if (prediction.isPast) {
      const record = await upsertDayAccuracy(park, date);
      if (record) {
        const hitLabel = record.levelHit ? "的中" : "外れ";
        const deltaLabel =
          record.scoreDelta === 0
            ? "差なし"
            : record.scoreDelta > 0
              ? `予測が ${record.scoreDelta} 点高め`
              : `予測が ${Math.abs(record.scoreDelta)} 点低め`;
        accuracy = {
          levelHit: record.levelHit,
          predictedLevel: record.predictedLevel,
          predictedScore: record.predictedScore,
          actualLevel: record.actualLevel,
          actualScore: record.actualScore,
          actualAverageWait: record.actualAverageWait,
          scoreDelta: record.scoreDelta,
          explanation: `予想は「${crowdLevelLabels[record.predictedLevel]}」（${record.predictedScore}点）。実績は平均待ち約${record.actualAverageWait}分から「${crowdLevelLabels[record.actualLevel]}」（${record.actualScore}点）と推定 → ${hitLabel}（${deltaLabel}）。月次で同じ外れ理由が続く条件は自動見直しし、的中率を上げていきます。`,
        };
      } else {
        accuracy = {
          levelHit: false,
          predictedLevel: prediction.crowdLevel,
          predictedScore: prediction.crowdScore,
          actualLevel: prediction.crowdLevel,
          actualScore: prediction.crowdScore,
          actualAverageWait: 0,
          scoreDelta: 0,
          pending: true,
          explanation:
            "この日の待ち時間スナップショットがまだ十分でないため、的中率は未評価です。予想スコアと混雑理由はそのまま参照できます。",
        };
      }
    }

    const summary = prediction.isPast
      ? accuracy && !accuracy.pending
        ? `予想時の混雑は「${prediction.crowdLabel}」（${prediction.crowdScore}点）。的中結果は${accuracy.levelHit ? "的中" : "外れ"}です。${accuracy.explanation}`
        : `予想時の混雑は「${prediction.crowdLabel}」（${prediction.crowdScore}点）。${prediction.description}`
      : prediction.description;

    return {
      park,
      parkName: prediction.parkName,
      crowdLevel: prediction.crowdLevel,
      timeAdvice: buildTimeAdvice(park, prediction.crowdLevel, date),
      seasonalAdvice: [
        ...prediction.factors.map((f) => `${f}の傾向`),
        ...buildSeasonalAdvice(date),
      ],
      touringPlan: [],
      summary,
      fetchedAt: new Date().toISOString(),
      targetDate: date,
      prediction,
      breakdown,
      accuracy,
    };
  }

  const [attractions, status] = await Promise.all([
    fetchParkLiveData(park),
    buildParkCrowdStatus(park),
  ]);

  const touringPlan = buildTouringPlan(attractions);
  const nowCount = touringPlan.filter((item) => item.priority === "now").length;
  const breakdown = buildCrowdBreakdown(today, park);

  return {
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    crowdLevel: status.crowdLevel,
    timeAdvice: buildTimeAdvice(park, status.crowdLevel),
    seasonalAdvice: buildSeasonalAdvice(),
    touringPlan,
    summary: `${DISNEY_PARKS[park].nameJa}は現在${status.crowdLabel}（平均待ち ${status.averageWait}分）。今すぐ向かう候補は ${nowCount} 件です。`,
    fetchedAt: new Date().toISOString(),
    targetDate: today,
    breakdown,
  };
}

function bumpCrowdLevel(level: CrowdLevel): CrowdLevel {
  const order: CrowdLevel[] = ["low", "moderate", "high", "extreme"];
  const index = order.indexOf(level);
  return order[Math.min(index + 1, order.length - 1)];
}

export function buildForecastStatus(
  park: DisneyParkKey,
  prediction: ReturnType<typeof predictCrowdForDate>,
): ParkCrowdStatus {
  return {
    park,
    parkName: prediction.parkName,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: prediction.crowdLabel,
    averageWait: prediction.estimatedWait,
    medianWait: prediction.estimatedWait,
    operatingCount: 0,
    highWaitCount: 0,
    extremeWaitCount: 0,
    fetchedAt: new Date().toISOString(),
    isOpen: false,
  };
}

export function predictDailyCrowd(
  park: DisneyParkKey,
  status: ParkCrowdStatus,
  forDate?: string,
): { label: string; description: string } {
  const date = forDate ?? getJstToday();
  if (date !== getJstToday()) {
    const prediction = predictCrowdForDate(park, date);
    return {
      label: prediction.crowdLabel,
      description: prediction.description,
    };
  }

  const { day, month } = getJstContext();
  let predicted = status.crowdLevel;

  if (day === 0 || day === 6) {
    predicted = bumpCrowdLevel(predicted);
  }

  if (month === 7 || month === 8 || month === 3) {
    predicted = bumpCrowdLevel(predicted);
  }

  return {
    label: crowdLevelLabels[predicted],
    description: `本日の${DISNEY_PARKS[park].nameJa}は、現在の待ち時間と曜日・時期から${crowdLevelLabels[predicted]}程度と予測されます。`,
  };
}
