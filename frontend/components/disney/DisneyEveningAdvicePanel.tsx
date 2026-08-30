"use client";

import DisneyCompanion from "@/components/disney/DisneyCompanion";
import { crowdLevelColors, disneyPanelClass, formatJstDateLabel } from "@/lib/disney-utils";
import type { DisneyCharacterEveningAdvice, DisneyParkKey } from "@/lib/types/disney";
import { useEffect, useState } from "react";

type DisneyEveningAdvicePanelProps = {
  park: DisneyParkKey;
  targetDate: string;
};

export default function DisneyEveningAdvicePanel({
  park,
  targetDate,
}: DisneyEveningAdvicePanelProps) {
  const [advice, setAdvice] = useState<DisneyCharacterEveningAdvice | null>(null);
  const requestKey = `${park}:${targetDate}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/disney/evening-advice?park=${park}&date=${targetDate}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as DisneyCharacterEveningAdvice) : null,
      )
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        if (data) setAdvice(data);
        setLoadedKey(`${park}:${targetDate}`);
      });

    return () => {
      cancelled = true;
    };
  }, [park, targetDate]);

  const loading = loadedKey !== requestKey;
  const characterId = park === "tdl" ? "baymax" : "elsa";

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
        Evening Briefing
      </p>
      <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
        {park === "tdl" ? "ベイマックス―" : "エルサ―"}のアドバイス
        {advice ? `（${advice.targetDayLabel}）` : ""}
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        {formatJstDateLabel(targetDate)} 来園向け — ルールベース予測（AI コストなし）
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">アドバイスを準備中...</p>
      ) : advice ? (
        <div className="mt-4 space-y-4">
          <DisneyCompanion
            characterId={characterId}
            mood="speaking"
            nameJa={advice.characterNameJa}
            line={advice.headline}
          />

          <div
            className={`rounded-xl border p-3 ${crowdLevelColors[advice.crowdLevel]}`}
          >
            <p className="text-sm font-medium">
              混雑スコア {advice.crowdScore} / 100
            </p>
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              混雑理由
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-200">
              {advice.crowdReasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              注意点
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-200">
              {advice.cautions.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              回り方アドバイス
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-200">
              {advice.touringTips.map((tip) => (
                <li key={tip}>• {tip}</li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <p className="mt-6 text-sm text-rose-300">アドバイスを取得できませんでした。</p>
      )}
    </div>
  );
}
