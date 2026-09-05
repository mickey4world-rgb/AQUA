import { DISNEY_PARKS } from "@/lib/disney-constants";
import { crowdLevelLabels, formatJstDateLabel } from "@/lib/disney-utils";
import { buildCrowdBreakdown } from "@/lib/server/disney-crowd-breakdown";
import { predictCrowdForDate } from "@/lib/server/disney-calendar-prediction";
import type {
  CrowdLevel,
  DisneyAdviceAccuracy,
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
    { score: breakdown.schoolK12, label: breakdown.labels.schoolK12 },
    { score: breakdown.universityBreak, label: breakdown.labels.universityBreak },
    { score: breakdown.event, label: breakdown.labels.event },
    { score: breakdown.regionalPassport, label: breakdown.labels.regionalPassport },
    { score: breakdown.shareholderPassport, label: breakdown.labels.shareholderPassport },
    { score: breakdown.otherThemeParks, label: breakdown.labels.otherThemeParks },
    { score: breakdown.metroEvents, label: breakdown.labels.metroEvents },
    { score: breakdown.disasterImpact, label: breakdown.labels.disasterImpact },
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
  dayLabel: string,
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
  dayLabel: string,
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

function baymaxMonologue(
  park: DisneyParkKey,
  level: CrowdLevel,
  breakdown: ReturnType<typeof buildCrowdBreakdown>,
  dayLabel: string,
): string[] {
  const lines = [
    `${dayLabel}のデータシートを開きました。私のバルーン体でも、人混みには気をつけます。`,
    level === "extreme" || level === "high"
      ? "スキャン結果: 列の長さは『長い』。でもあなたの笑顔指数を守るルートがあります。"
      : "スキャン結果: ゆとりあり。写真タイムとスナックタイムを治療計画に追加できます。",
    breakdown.weather >= 55
      ? "気象ケア: 水分は必須です。私は中にゲルが入っていますが、あなたは水をどうぞ。"
      : "気象ケア: 大きな警報はありません。帽子があると安心スコアが上がります。",
    park === "tdl"
      ? "ランド豆知識: 人気ライドは午前に集中。午後はパレードの人波が『壁』になります。"
      : "ランド豆知識…いえ、今日はランド担当です。足を休めつつ、主要3件を先に。",
    "ケアの締め: 痛みが10段階で5を超えたら、ベンチで深呼吸。私も隣で膨らみます。",
  ];
  if (breakdown.event >= 50) {
    lines.splice(3, 0, "イベント検知: ショー前後は移動が滞ります。端を歩くと圧迫感が下がります。");
  }
  return lines.slice(0, 5);
}

function elsaMonologue(
  park: DisneyParkKey,
  level: CrowdLevel,
  breakdown: ReturnType<typeof buildCrowdBreakdown>,
  dayLabel: string,
): string[] {
  const lines = [
    `${dayLabel}の予報を、氷の鏡に映してみたわ。見え方はこんな感じ。`,
    level === "extreme" || level === "high"
      ? "混雑は高い氷の壁。でも崩さなくていいの。回る順番を凍らせて、一つずつ溶かしましょう。"
      : "今日の氷は薄め。ゆっくり歩いても、物語はちゃんと進むわ。",
    breakdown.weather >= 55
      ? "天候は少し気難しいわ。私は寒さに強いけど、あなたは帽子と水分を忘れないで。"
      : "空は穏やか。雪が舞うほどの騒ぎにはならないでしょう。",
    park === "tds"
      ? "シーはエリア間が広いの。地図を頭に入れておくと、氷の滑り台みたいにスムーズよ。"
      : "シー担当として言うわ—欲張らず『Must』を3つに。それが女王の知恵。",
    "最後に一言。Conceal, don't feel…は待ち時間には禁止。感じたら、次の一手を決めましょう。",
  ];
  if (breakdown.shareholderPassport >= 50 || breakdown.regionalPassport >= 50) {
    lines.splice(
      3,
      0,
      "特別なチケットの気配があるわ。開園前の準備が、魔法より効く日になるかも。",
    );
  }
  return lines.slice(0, 5);
}

function baymaxAccuracyReflection(accuracy: DisneyAdviceAccuracy): string {
  if (accuracy.pending) {
    return "実績データがまだ薄いので、的中判定は保留です。予想の係数は保管済み。揃い次第、再スキャンします。";
  }
  if (accuracy.levelHit) {
    return `的中です。予想 ${accuracy.predictedScore} 点、実績も同じ帯でした。ケアプロトコル『この調子』を継続します。外れ要因の学習は月次で続けます。`;
  }
  return `ズレを検出。予想 ${accuracy.predictedScore} 点 → 実績およそ ${accuracy.actualScore} 点（平均待ち約 ${accuracy.actualAverageWait} 分）。痛み度は低いです。同じ外れ理由が続く条件は、自動で見直し対象にします。`;
}

function elsaAccuracyReflection(accuracy: DisneyAdviceAccuracy): string {
  if (accuracy.pending) {
    return "実績の雪解けを待っているわ。予想はそのまま残してあるから、データが来たら的中を確かめましょう。";
  }
  if (accuracy.levelHit) {
    return `的中ね。予想 ${accuracy.predictedScore} 点は実績と重なったわ。良い条件は Let it go せず、次も活かすの。弱い氷だけ月次で削りましょう。`;
  }
  return `少しズレたわ。予想 ${accuracy.predictedScore} 点、実績はおよそ ${accuracy.actualScore} 点（待ち約 ${accuracy.actualAverageWait} 分）。でも氷は張り直せる。同じ外れパターンが続けば、条件を凍らせて見直しよ。`;
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
    tips.push("グッズ屋さんも混みやすいです。夕方前に『欲しいものリスト』を1つに絞ると安心です。");
    return tips.slice(0, 5);
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
  tips.push("夜のショーは美しいわ。でも帰る列も物語の一部—早めに出口ルートを決めておいて。");
  return tips.slice(0, 5);
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
      "休憩プロトコル: 90分に一度、日陰で3分。私が膨張するくらいのペースで十分です。",
    ];
    if (level === "low" || level === "moderate") {
      tips.push("空き日は午後も余裕。ショーやグッズを楽しむ『治療』時間を確保できます。");
    } else {
      tips.push("混雑日は『絶対乗りたい』を3つまで。それ以外はボーナス扱いが精神衛生に良いです。");
    }
    return tips.slice(0, 5);
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
  return tips.slice(0, 5);
}

export function buildCharacterEveningAdvice(
  park: DisneyParkKey,
  targetDate: string,
  dayContext: "today" | "tomorrow" | "other",
  mode: "evening" | "preview" = "preview",
  options?: { accuracy?: DisneyAdviceAccuracy | null },
): DisneyCharacterEveningAdvice {
  const prediction = predictCrowdForDate(park, targetDate);
  const breakdown = buildCrowdBreakdown(targetDate, park);
  const { characterId, characterNameJa } = parkCharacter(park);
  const targetDayLabel =
    dayContext === "today"
      ? "本日"
      : dayContext === "tomorrow"
        ? "明日"
        : formatJstDateLabel(targetDate);
  const crowdReasons =
    characterId === "elsa"
      ? elsaCrowdReasons(breakdown)
      : [
          breakdown.total >= 70
            ? "混雑警報: ケア計画を前倒し推奨です。"
            : breakdown.total <= 35
              ? "低負荷モード。笑顔の余白があります。"
              : "標準負荷。計画どおり進めれば安心です。",
          ...topFactors(breakdown).slice(0, 3),
        ];

  const headline =
    characterId === "baymax"
      ? baymaxHeadline(prediction.crowdLevel, breakdown.total, targetDayLabel)
      : elsaHeadline(prediction.crowdLevel, breakdown.total, targetDayLabel);

  const monologue =
    characterId === "baymax"
      ? baymaxMonologue(park, prediction.crowdLevel, breakdown, targetDayLabel)
      : elsaMonologue(park, prediction.crowdLevel, breakdown, targetDayLabel);

  const accuracy = options?.accuracy ?? null;
  const accuracyReflection = accuracy
    ? characterId === "baymax"
      ? baymaxAccuracyReflection(accuracy)
      : elsaAccuracyReflection(accuracy)
    : null;

  const monologueWithAccuracy =
    accuracyReflection && dayContext === "other"
      ? [...monologue.slice(0, 4), accuracyReflection]
      : monologue;

  return {
    park,
    parkName: DISNEY_PARKS[park].nameJa,
    targetDate,
    targetDayLabel,
    characterId,
    characterNameJa,
    headline,
    monologue: monologueWithAccuracy,
    crowdReasons,
    cautions: buildCautions(park, prediction.crowdLevel, breakdown, characterId),
    touringTips: buildTouringTips(park, prediction.crowdLevel, characterId),
    accuracyReflection,
    breakdown,
    crowdLevel: prediction.crowdLevel,
    crowdLabel: crowdLevelLabels[prediction.crowdLevel],
    crowdScore: breakdown.total,
    generatedAt: new Date().toISOString(),
    mode,
  };
}
