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
    {
      score: breakdown.shareholderPassport,
      label: breakdown.labels.shareholderPassport,
    },
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
  if (level === "extreme") {
    return `Here we go！ It's-a me, ${MARIO_NAME}！ ${dayLabel}は混雑スコア ${score} — Woohoo…どころか大混雑コースだ！開園ダッシュでコインを掻き集めよう！`;
  }
  if (level === "high") {
    return `Let's-a go！ ${MARIO_NAME}だ！ ${dayLabel}はスコア ${score}。ちょっと忙しいぞ。ファイアー投げて人気ライドから攻略だ！`;
  }
  if (level === "moderate") {
    return `Wahoo！ ${MARIO_NAME}さ！ ${dayLabel}はちょうどいい ${score} 点。ジャンプも写真も楽しめるぞ！`;
  }
  return `Mamma mia！ ${MARIO_NAME}だ！ ${dayLabel}は空いててスコア ${score}。キノコ拾うようにゆったり巡ろう！`;
}

function marioMonologue(
  level: CrowdLevel,
  breakdown: DisneyCrowdBreakdown,
  dayLabel: string,
): string[] {
  const busy = level === "extreme" || level === "high";
  const lines = [
    `Here we go！ ${dayLabel}のマップを広げたぞ！パイプの向こうもチェック済みさ！`,
    busy
      ? "Woohoo…人波が多い！朝一は任天堂エリアか魔法界のどっちかでスターを取れ！コインは後からでいいぞ！"
      : "Wahoo！ゆとりあり！スヌーピーやキティのエリアでコイン集めしながら休憩してもいいぞ！",
    busy
      ? "列が長いところはファイアーボールみたいにスキップ！エクスプレスは本当に必要な1〜2発だけさ！"
      : "空いてるライドはジャンプ台だ！ポンポン回ってコインゲットだ！",
    breakdown.weather >= 40
      ? "Mamma mia、天気には注意だ。水分補給はパワーアップと同じくらい大事さ！"
      : "天候はまずまず。帽子があると安心だぞ！",
    `いま効いてる要因: ${topFactors(breakdown).slice(0, 2).join(" / ")}`,
    busy
      ? "体力ゲージが減ったらすぐ休憩！ゲームオーバーより1アップ優先さ。Let's-a go！"
      : "夜のライトアップ前に写真スポットへ。最後にスター取ってクリアだ！Yahoo！",
  ];
  return lines;
}

function marioCautions(level: CrowdLevel): string[] {
  if (level === "extreme" || level === "high") {
    return [
      "全部クリアしようとしない。スターは3つで十分さ！ Mamma mia！",
      "長い列で体力ゲージが減る前に休憩を！コインより笑顔優先だ！",
      "Here we go の勢いで走りすぎない。水分と日陰を忘れずに！",
    ];
  }
  return [
    "日差しと水分に注意。ゲームオーバーは避けよう！",
    "空いてても無理に全部回らない。Wahoo なペースで！",
  ];
}

function marioTouringTips(level: CrowdLevel): string[] {
  if (level === "extreme" || level === "high") {
    return [
      "Here we go！開園直後: 任天堂ワールド → ハリー・ポッター系",
      "昼はショー／食事で人波をかわす（ファイアースキップ）",
      "エクスプレスは本当に必要な1〜2施設だけ",
      "夕方に空いたライドでコインゲット",
    ];
  }
  return [
    "Let's-a go！午前に人気2件、午後は散策とショー",
    "サンリオ／スヌーピーで休憩タイム＆コイン集め",
    "夜のライトアップ前に写真スポットへ。Yahoo！",
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
