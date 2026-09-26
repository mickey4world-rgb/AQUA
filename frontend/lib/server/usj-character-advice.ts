import { crowdLevelLabels, formatJstDateLabel } from "@/lib/disney-utils";
import { buildUsjCrowdBreakdown } from "@/lib/server/usj-crowd-breakdown";
import { predictUsjCrowdForDate } from "@/lib/server/usj-calendar-prediction";
import { USJ_PARK } from "@/lib/usj-constants";
import type {
  CrowdLevel,
  DisneyCharacterEveningAdvice,
  DisneyCrowdBreakdown,
} from "@/lib/types/disney";

const MARIO_NAME = "マリオ―";

function topFactors(breakdown: DisneyCrowdBreakdown): string[] {
  const entries = [
    { score: breakdown.calendar, label: breakdown.labels.calendar },
    { score: breakdown.seasonal, label: breakdown.labels.seasonal },
    { score: breakdown.schoolK12, label: breakdown.labels.schoolK12 },
    { score: breakdown.event, label: breakdown.labels.event },
    { score: breakdown.regionalPassport, label: breakdown.labels.regionalPassport },
    { score: breakdown.otherThemeParks, label: breakdown.labels.otherThemeParks },
    { score: breakdown.metroEvents, label: breakdown.labels.metroEvents },
    { score: breakdown.weather, label: breakdown.labels.weather },
  ];
  return entries
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((e) => `${e.label}（${e.score}点）`);
}

function marioHeadline(level: CrowdLevel, score: number, dayLabel: string): string {
  const intro = `It's-a me, ${MARIO_NAME}！ ${dayLabel}の混雑スコアは ${score} だ！`;
  if (level === "extreme") {
    return `${intro} Woohoo…どころじゃない混みようだ！開園ダッシュでスターを取ろう！`;
  }
  if (level === "high") {
    return `${intro} ちょっと忙しいコースだね。エクスプレスは保険、まずは人気アトラクションから！`;
  }
  if (level === "moderate") {
    return `${intro} ちょうどいいバランスさ！写真もライドも楽しめるぞ！`;
  }
  return `${intro} Mamma mia、空いてる！ゆっくりキノコを集めるように巡ろう！`;
}

function marioMonologue(
  level: CrowdLevel,
  breakdown: DisneyCrowdBreakdown,
  dayLabel: string,
): string[] {
  return [
    `${dayLabel}のマップを広げたぞ！パイプの向こうもチェック済みさ！`,
    level === "extreme" || level === "high"
      ? "ここがヤマ場だ！任天堂エリアか魔法界、どちらかを朝一で攻略だ！"
      : "ゆとりあり！スヌーピーやキティのエリアで休憩してもいいぞ！",
    breakdown.weather >= 40
      ? "天気には注意だ。水分補給はパワーアップと同じくらい大事さ！"
      : "天候はまずまず。帽子があると安心だぞ！",
    `いま効いてる要因: ${topFactors(breakdown).slice(0, 2).join(" / ")}`,
    "Let's-a go！無理は禁物。1アップより笑顔の方が大事だ！",
  ];
}

function marioCautions(level: CrowdLevel): string[] {
  if (level === "extreme" || level === "high") {
    return [
      "全部クリアしようとしない。スターは3つで十分さ！",
      "長い列で体力ゲージが減る前に休憩を！",
    ];
  }
  return ["日差しと水分に注意。ゲームオーバーは避けよう！"];
}

function marioTouringTips(level: CrowdLevel): string[] {
  if (level === "extreme" || level === "high") {
    return [
      "開園直後: 任天堂ワールド → ハリー・ポッター系",
      "昼はショー／食事で人波を避ける",
      "エクスプレスは本当に必要な1〜2施設だけ",
      "夕方に空いたライドを拾う",
    ];
  }
  return [
    "午前に人気2件、午後は散策とショー",
    "サンリオ／スヌーピーで休憩タイム",
    "夜のライトアップ前に写真スポットへ",
  ];
}

export function buildMarioEveningAdvice(
  targetDate: string,
  mode: "evening" | "preview" = "preview",
): DisneyCharacterEveningAdvice {
  const prediction = predictUsjCrowdForDate(targetDate);
  const breakdown = buildUsjCrowdBreakdown(targetDate);
  const dayLabel = formatJstDateLabel(targetDate);
  const level = prediction.crowdLevel;

  return {
    park: "usj" as DisneyCharacterEveningAdvice["park"],
    parkName: USJ_PARK.nameJa,
    targetDate,
    targetDayLabel: dayLabel,
    characterId: "baymax", // 型互換。表示名はマリオ―
    characterNameJa: MARIO_NAME,
    headline: marioHeadline(level, prediction.crowdScore, dayLabel),
    monologue: marioMonologue(level, breakdown, dayLabel),
    crowdReasons: topFactors(breakdown),
    cautions: marioCautions(level),
    touringTips: marioTouringTips(level),
    accuracyReflection: null,
    breakdown,
    crowdLevel: level,
    crowdLabel: crowdLevelLabels[level],
    crowdScore: prediction.crowdScore,
    generatedAt: new Date().toISOString(),
    mode,
  };
}
