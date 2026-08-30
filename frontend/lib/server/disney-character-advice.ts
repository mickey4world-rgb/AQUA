import { DISNEY_PARKS } from "@/lib/disney-constants";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import type {
  CrowdLevel,
  DisneyCharacterEveningAdvice,
  DisneyParkKey,
} from "@/lib/types/disney";

function parkCharacter(park: DisneyParkKey): {
  characterId: "baymax" | "elsa";
  characterNameJa: string;
} {
  return park === "tdl"
    ? { characterId: "baymax", characterNameJa: "ベイマックス" }
    : { characterId: "elsa", characterNameJa: "エルサ" };
}

function topFactors(breakdown: ReturnType<typeof buildCrowdBreakdown>): string[] {
  const entries = [
    { key: "calendar", score: breakdown.calendar, label: breakdown.labels.calendar },
    { key: "seasonal", score: breakdown.seasonal, label: breakdown.labels.seasonal },
    { key: "event", score: breakdown.event, label: breakdown.labels.event },
    { key: "weather", score: breakdown.weather, label: breakdown.labels.weather },
    { key: "merchandise", score: breakdown.merchandise, label: breakdown.labels.merchandise },
    { key: "newsBuzz", score: breakdown.newsBuzz, label: breakdown.labels.newsBuzz },
    { key: "historical", score: breakdown.historical, label: breakdown.labels.historical },
  ];
  return entries
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((e) => `${e.label}（${e.score}点）`);
}

function baymaxHeadline(level: CrowdLevel, score: number): string {
  if (level === "extreme") return `混雑スコア ${score}。明日は高負荷の可能性が高いです。`;
  if (level === "high") return `混雑スコア ${score}。明日は計画的な行動がおすすめです。`;
  if (level === "moderate") return `混雑スコア ${score}。明日はバランスの取れた回り方が可能です。`;
  return `混雑スコア ${score}。明日は比較的ゆとりのある一日になる見込みです。`;
}

function elsaHeadline(level: CrowdLevel, score: number): string {
  if (level === "extreme") return `混雑の氷壁が高い日です（スコア ${score}）。早朝の行動が鍵よ。`;
  if (level === "high") return `混雑スコア ${score}。焦らず、優先順位を決めて進みましょう。`;
  if (level === "moderate") return `スコア ${score}。計画次第で快適に過ごせる日よ。`;
  return `スコア ${score}。穏やかな一日。ゆっくり魔法を楽しんで。`;
}

function buildCautions(
  park: DisneyParkKey,
  level: CrowdLevel,
  breakdown: ReturnType<typeof buildCrowdBreakdown>,
): string[] {
  const tips: string[] = [];
  if (breakdown.weather >= 55) {
    tips.push("暑さ・雨の可能性。水分補給と屋内アトラクションの優先を。");
  }
  if (breakdown.event >= 50) {
    tips.push("イベント日はショー前後に移動が集中しやすいです。");
  }
  if (breakdown.merchandise >= 50) {
    tips.push("限定グッズ販売で午前中からショップ周辺が混みやすいです。");
  }
  if (level === "high" || level === "extreme") {
    tips.push("開園30分前到着を推奨。DPA・スタンバイパス枠の事前確認を。");
  }
  if (park === "tds") {
    tips.push("エリア間移動が多いため、地図でルートを前日に決めておくと効率的です。");
  } else {
    tips.push("ランドは人気アトラクションが集中。午前中に主要3件を終わらせるのが定石です。");
  }
  return tips.slice(0, 4);
}

function buildTouringTips(
  park: DisneyParkKey,
  level: CrowdLevel,
): string[] {
  if (park === "tdl") {
    const tips = [
      "開園直後: 美女と野獣 → ベイマックス → スペース・マウンテンの順が定番。",
      "11〜13時はレストラン混雑。軽食を早めに済ませると待ち時間を有効活用できます。",
      "夕方パレード前後は移動が滞りやすい。逆に一部アトラクションが空くことも。",
    ];
    if (level === "low" || level === "moderate") {
      tips.push("空き日は午後も比較的余裕。ショーやグッズを楽しむ時間を確保できます。");
    }
    return tips;
  }

  const tips = [
    "開園直後: センター・オブ・ジ・アース → ソアリン → タワー・オブ・テラーの順がおすすめ。",
    "地中海ハーバー周辺は昼食ピークで混雑。11時前後に食事を済ませる手も。",
    "インディ・ジョーンズは夕方以降に空くことが多い。午前は他を優先。",
  ];
  if (level === "low" || level === "moderate") {
    tips.push("比較的空いている日は、ショーやシー全体の雰囲気をゆっくり楽しめます。");
  }
  return tips;
}

export function buildCharacterEveningAdvice(
  park: DisneyParkKey,
  targetDate: string,
  mode: "evening" | "preview" = "evening",
): DisneyCharacterEveningAdvice {
  const prediction = predictCrowdForDate(park, targetDate);
  const breakdown = buildCrowdBreakdown(targetDate, park);
  const { characterId, characterNameJa } = parkCharacter(park);
  const crowdReasons = topFactors(breakdown);

  const headline =
    characterId === "baymax"
      ? baymaxHeadline(prediction.crowdLevel, breakdown.total)
      : elsaHeadline(prediction.crowdLevel, breakdown.total);

  return {
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    targetDate,
    characterId,
    characterNameJa,
    headline,
    crowdReasons,
    cautions: buildCautions(park, prediction.crowdLevel, breakdown),
    touringTips: buildTouringTips(park, prediction.crowdLevel),
    breakdown,
    crowdLevel: prediction.crowdLevel,
    crowdScore: breakdown.total,
    generatedAt: new Date().toISOString(),
    mode,
  };
}
