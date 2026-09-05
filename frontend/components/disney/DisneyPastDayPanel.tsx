"use client";

import DisneyCompanion from "@/components/disney/DisneyCompanion";
import { crowdLevelColors, disneyPanelClass, formatJstDateLabel } from "@/lib/disney-utils";
import type { DisneyAdvice, DisneyParkKey } from "@/lib/types/disney";

type DisneyPastDayPanelProps = {
  park: DisneyParkKey;
  date: string;
  advice: DisneyAdvice | null;
  loading?: boolean;
};

function buildCharacterReflection(
  park: DisneyParkKey,
  advice: DisneyAdvice,
  date: string,
): { headline: string; outlook: string[] } {
  const character = park === "tdl" ? "baymax" : "elsa";
  const score = advice.prediction?.crowdScore ?? advice.breakdown?.total ?? 0;
  const accuracy = advice.accuracy;
  const dayLabel = formatJstDateLabel(date);

  if (character === "baymax") {
    if (!accuracy || accuracy.pending) {
      return {
        headline: `こんにちは。私はベイマックス―。${dayLabel}の予想スコアは ${score} でした。実績データが揃い次第、的中チェックを行います。`,
        outlook: [
          "予想時の係数はそのまま保管し、実績が揃ったら照合します。",
          "同じ外れ要因が続く場合は、条件を自動で見直して的中率を上げていきます。",
          "予想を改善しながら、一緒に的中率を自動的に上げていきましょう。",
        ],
      };
    }
    if (accuracy.levelHit) {
      return {
        headline: `スキャン完了。予想（${accuracy.predictedScore}点）と実績は一致しました。的中です。ケアプロトコルは「この調子」。`,
        outlook: [
          "的中した要因は次回も活かし、安定した予測精度を維持します。",
          "月次レビューで弱い条件だけを微調整し、的中率をさらに上げます。",
          "予想を改善しながら、的中率を自動的に上げていきましょう。",
        ],
      };
    }
    return {
      headline: `スキャンでズレを検出。予想 ${accuracy.predictedScore} 点に対し実績は約 ${accuracy.actualScore} 点でした。痛み度は低いです。改善できます。`,
      outlook: [
        "外れ理由を記録し、同じ要因が繰り返される条件は自動見直しの対象になります。",
        "株主優待・季節・イベントなどの係数を学習し、次回の予想精度を高めます。",
        "予想を改善しながら、的中率を自動的に上げていきましょう。",
      ],
    };
  }

  if (!accuracy || accuracy.pending) {
    return {
      headline: `私はエルサ―。${dayLabel}の予想スコアは ${score} よ。実績の雪解けを待って、的中を確かめましょう。`,
      outlook: [
        "予想時の係数はそのまま残しておくわ。",
        "データが揃えば、同じ外れ理由を凍らせて条件を見直すの。",
        "予想を改善しながら、的中率を自動的に上げていきましょう。",
      ],
    };
  }
  if (accuracy.levelHit) {
    return {
      headline: `予想（${accuracy.predictedScore}点）は実績と重なったわ。的中ね。Let it go…いや、良い条件は手放さないで。`,
      outlook: [
        "当たった要因は次の予想にも活かしていくわ。",
        "弱い氷だけ月次で削って、的中率をもっと高くするの。",
        "予想を改善しながら、的中率を自動的に上げていきましょう。",
      ],
    };
  }
  return {
    headline: `予想 ${accuracy.predictedScore} 点、実績はおよそ ${accuracy.actualScore} 点。少しズレたわ。でも氷は張り直せる。`,
    outlook: [
      "外れの理由を記録して、同じパターンが続く条件は自動で見直すわ。",
      "特別優待や季節の波も取り入れて、次はもっと正確に。",
      "予想を改善しながら、的中率を自動的に上げていきましょう。",
    ],
  };
}

export default function DisneyPastDayPanel({
  park,
  date,
  advice,
  loading,
}: DisneyPastDayPanelProps) {
  const characterId = park === "tdl" ? "baymax" : "elsa";
  const characterNameJa = park === "tdl" ? "ベイマックス―" : "エルサ―";
  const prediction = advice?.prediction;
  const breakdown = advice?.breakdown;
  const accuracy = advice?.accuracy;
  const reflection = advice ? buildCharacterReflection(park, advice, date) : null;
  const crowdReasons =
    prediction?.factors?.length
      ? prediction.factors
      : breakdown
        ? Object.values(breakdown.labels).filter(
            (label) =>
              !label.includes("通常") &&
              !label.includes("平常") &&
              !label.includes("平均") &&
              label !== "災害影響小",
          ).slice(0, 6)
        : [];

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
        Past Day Forecast
      </p>
      <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
        {characterNameJa}の的中レビュー（{formatJstDateLabel(date)}）
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        予想時の係数はそのまま。追加で的中結果と改善の見通しを表示します。
      </p>

      {loading || !advice || !prediction ? (
        <p className="mt-6 text-sm text-slate-400">過去日の予想を読み込み中...</p>
      ) : (
        <div className="mt-4 space-y-4">
          <DisneyCompanion
            characterId={characterId}
            mood="speaking"
            nameJa={characterNameJa}
            line={reflection?.headline ?? prediction.description}
          />

          <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-fuchsia-300/80">
              Forecast
            </p>
            <p className="mt-1 text-sm font-semibold text-fuchsia-100">
              {prediction.crowdLabel}
            </p>
            <p className="mt-1 text-sm text-slate-300">{prediction.description}</p>
          </div>

          <div
            className={`rounded-xl border p-3 ${crowdLevelColors[prediction.crowdLevel]}`}
          >
            <p className="text-xs uppercase tracking-[0.16em] opacity-80">
              Crowd Score（予想時）
            </p>
            <p className="mt-1 text-2xl font-bold">
              {prediction.crowdScore}
              <span className="ml-1 text-sm font-normal opacity-80">/ 100</span>
            </p>
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              混雑理由（予想時）
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-200">
              {crowdReasons.length > 0 ? (
                crowdReasons.map((reason) => <li key={reason}>• {reason}</li>)
              ) : (
                <li>• 曜日・季節・イベント等の標準係数</li>
              )}
            </ul>
          </section>

          <section
            className={`rounded-xl border p-3 ${
              accuracy && !accuracy.pending
                ? accuracy.levelHit
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-rose-400/30 bg-rose-500/10"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              的中結果
            </h3>
            {accuracy && !accuracy.pending ? (
              <>
                <p className="mt-1 text-sm font-semibold text-white">
                  {accuracy.levelHit ? "的中" : "外れ"}
                  <span className="ml-2 font-normal text-slate-300">
                    予想 {accuracy.predictedScore}点 → 実績推定 {accuracy.actualScore}点
                    （差 {accuracy.scoreDelta > 0 ? "+" : ""}
                    {accuracy.scoreDelta}）
                  </span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  {accuracy.explanation}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-300">
                {accuracy?.explanation ?? "実績データ待ちのため、的中率は未評価です。"}
              </p>
            )}
          </section>

          {reflection && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                今後の前向きな対応
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-200">
                {reflection.outlook.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
