import { DISNEY_PARKS } from "@/lib/disney-constants";
import { crowdLevelLabels } from "@/lib/disney-utils";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import type {
  CrowdLevel,
  DisneyCharacterEveningAdvice,
  DisneyParkKey,
} from "@/lib/types/disney";

const BAYMAX_NAME = "ベイマックス―";
const ELSA_NAME = "エルサ―";

function parkCharacter(park: DisneyParkKey): {
  characterId: "baymax" | "elsa";
  characterNameJa: string;
} {
  return park === "tdl"
    ? { characterId: "baymax", characterNameJa: BAYMAX_NAME }
    : { characterId: "elsa", characterNameJa: ELSA_NAME };
}

function topFactors(breakdown: ReturnType<typeof buildCrowdBreakdown>): string[] {
  const entries = [
    { score: breakdown.calendar, label: breakdown.labels.calendar },
    { score: breakdown.seasonal, label: breakdown.labels.seasonal },
    { score: breakdown.event, label: breakdown.labels.event },
    { score: breakdown.weather, label: breakdown.labels.weather },
    { score: breakdown.merchandise, label: breakdown.labels.merchandise },
    { score: breakdown.newsBuzz, label: breakdown.labels.newsBuzz },
    { score: breakdown.historical, label: breakdown.labels.historical },
  ];
  return entries
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((e) => `${e.label}（${e.score}点）`);
}

function baymaxHeadline(
  level: CrowdLevel,
  score: number,
  dayLabel: "本日" | "明日",
): string {
  const intro = `こんにちは。私は${BAYMAX_NAME}。${dayLabel}の混雑スコアは ${score} です。`;
  if (level === "extreme") {
    return `${intro}心拍数が上昇する前に、開園直後の行動をおすすめします。パラポーズは…いえ、休憩も計画に入れてください。`;
  }
  if (level === "high") {
    return `${intro}待ち時間の痛み度は「7」前後の見込み。計画的な移動がケアになります。`;
  }
  if (level === "moderate") {
    return `${intro}バランスの取れた一日です。無理な走行は転倒リスクが上がります。`;
  }
  return `${intro}比較的ゆとりのある一日。ハッピーな散歩が可能なデータです。`;
}

function elsaHeadline(
  level: CrowdLevel,
  score: number,
  dayLabel: "本日" | "明日",
): string {
  const intro = `私は${ELSA_NAME}。${dayLabel}の混雑スコアは ${score} よ。`;
  if (level === "extreme") {
    return `${intro}混雑の氷壁は相当な高さね。Let it go…と言いたいところだけど、今日は計画を手放さないで。開園直後に動きましょう。`;
  }
  if (level === "high") {
    return `${intro}列は長いわ。でも焦る必要はないの。優先順位を凍結して、一つずつ溶かしていきましょう。`;
  }
  if (level === "moderate") {
    return `${intro}バランスの取れた一日。Build a snowman…ではなく、計画を組み立てれば魔法のようよ。`;
  }
  return `${intro}穏やかな風が吹いているわ。雪のように静かに、ゆっくり楽しんで。The cold never bothered me anyway…待ち時間くらいね。`;
}

function elsaCrowdReasons(
  breakdown: ReturnType<typeof buildCrowdBreakdown>,
): string[] {
  const base = topFactors(breakdown);
  const flavor =
    breakdown.total >= 70
      ? "氷の城より人が多い可能性あり。心の準備を。"
      : breakdown.total <= 35
        ? "アレンデール並みに穏やかな見込み。珍しいわ。"
        : "雪解け前のように、混雑も少しずつ変わるでしょう。";
  return [flavor, ...base.slice(0, 3)];
}

function buildCautions(
  park: DisneyParkKey,
  level: CrowdLevel,
  breakdown: ReturnType<typeof buildCrowdBreakdown>,
  characterId: "baymax" | "elsa",
): string[] {
  const tips: string[] = [];

  if (characterId === "baymax") {
    if (breakdown.weather >= 55) {
      tips.push("暑さ・雨のデータが高めです。水分補給を2時間おきに。私もタンクが心配です。");
    }
    if (level === "high" || level === "extreme") {
      tips.push("開園30分前到着を推奨。足の負担を1から10で聞かれる前に動きましょう。");
    }
    tips.push("パレード時間帯は人波で圧迫感が増します。端のベンチで深呼吸を。");
    if (park === "tdl") {
      tips.push("ランドは人気アトラクションが集中。午前中に主要3件を終えるとストレス指数が下がります。");
    }
    return tips.slice(0, 4);
  }

  if (breakdown.weather >= 55) {
    tips.push("雨や暑さで屋内に人が集まります。私の氷魔法で涼めるわけではないので、帽子と水分を。The cold never bothered me anyway…とは言えない日ね。");
  }
  if (breakdown.event >= 50) {
    tips.push("イベント日はショー前後に移動が集中。「Do you want to build a…」列？ いえ、先にアトラクションを。");
  }
  if (level === "high" || level === "extreme") {
    tips.push("混雑日は全部回る必要はないわ。選んで、手放す—それもまた女王の知恵よ。");
    tips.push("DPAやスタンバイパスは、氷のように冷静に、開園前に確認を。");
  } else {
    tips.push("比較的空いている日よ。アナがいたら「一緒に行こう！」と言われそう。自分のペースで。");
  }
  if (park === "tds") {
    tips.push("シーはエリア間の移動が多い。地図を前日に見ておけば、氷の滑り台のようにスムーズよ。");
  }
  return tips.slice(0, 4);
}

function buildTouringTips(
  park: DisneyParkKey,
  level: CrowdLevel,
  characterId: "baymax" | "elsa",
): string[] {
  if (characterId === "baymax") {
    const tips = [
      "開園直後: 美女と野獣 → 新エリアの人気ライド → スペース・マウンテン。走るときは膝を軽く曲げて。",
      "11〜13時はレストラン混雑。軽食を早めに済ませると、血糖値と気分が安定します。",
      "夕方パレード前後は移動が滞ります。私のソフトな体のように、柔らかく人波に乗りましょう。",
    ];
    if (level === "low" || level === "moderate") {
      tips.push("空き日は午後も余裕。ショーやグッズを楽しむ『治療』時間を確保できます。");
    }
    return tips;
  }

  const tips = [
    "開園直後: センター・オブ・ジ・アース → ソアリン → タワー・オブ・テラー。恐れないで。Conceal, don't feel…待ち時間は直視して。",
    "地中海ハーバーは昼食ピーク。11時前に食べれば、列に凍りつかなくて済むわ。",
    "インディは夕方以降に空くことが多い。午前は他を優先—焦燥は氷を割るのよ。",
    "ショーの時間帯は人波がうねるわ。魔法は使えないから、端の席で深呼吸を。",
  ];
  if (level === "low" || level === "moderate") {
    tips.push("静かな日は、シー全体をゆっくり。雪が舞うように、時間を溶かしていいの。");
  } else {
    tips.push("混雑日は「Must-have」アトラクションを3つに絞って。欲張ると心が凍るわ。");
  }
  return tips.slice(0, 4);
}

export function buildCharacterEveningAdvice(
  park: DisneyParkKey,
  targetDate: string,
  dayContext: "today" | "tomorrow",
  mode: "evening" | "preview" = "preview",
): DisneyCharacterEveningAdvice {
  const prediction = predictCrowdForDate(park, targetDate);
  const breakdown = buildCrowdBreakdown(targetDate, park);
  const { characterId, characterNameJa } = parkCharacter(park);
  const targetDayLabel = dayContext === "today" ? "本日" : "明日";
  const crowdReasons =
    characterId === "elsa"
      ? elsaCrowdReasons(breakdown)
      : topFactors(breakdown);

  const headline =
    characterId === "baymax"
      ? baymaxHeadline(prediction.crowdLevel, breakdown.total, targetDayLabel)
      : elsaHeadline(prediction.crowdLevel, breakdown.total, targetDayLabel);

  return {
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    targetDate,
    targetDayLabel,
    characterId,
    characterNameJa,
    headline,
    crowdReasons,
    cautions: buildCautions(park, prediction.crowdLevel, breakdown, characterId),
    touringTips: buildTouringTips(park, prediction.crowdLevel, characterId),
    breakdown,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: crowdLevelLabels[prediction.crowdLevel],
    crowdScore: breakdown.total,
    generatedAt: new Date().toISOString(),
    mode,
  };
}
