"use client";

import DisneyCompanion from "@/components/disney/DisneyCompanion";
import {
  crowdLevelColors,
  disneyPanelClass,
  formatJstDateLabel,
} from "@/lib/disney-utils";
import type { DisneyCharacterEveningAdvice } from "@/lib/types/disney";
import { useEffect, useState } from "react";

type UsjEveningAdvicePanelProps = {
  targetDate: string;
};

export default function UsjEveningAdvicePanel({
  targetDate,
}: UsjEveningAdvicePanelProps) {
  const [advice, setAdvice] = useState<DisneyCharacterEveningAdvice | null>(
    null,
  );
  const requestKey = targetDate;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/usj/evening-advice?date=${targetDate}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as DisneyCharacterEveningAdvice) : null,
      )
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        if (data) setAdvice(data);
        setLoadedKey(targetDate);
      });

    return () => {
      cancelled = true;
    };
  }, [targetDate]);

  const loading = loadedKey !== requestKey;

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <p className="text-xs uppercase tracking-[0.2em] text-red-300/80">
        Evening Briefing
      </p>
      <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
        マリオ―のアドバイス
        {advice ? `（${advice.targetDayLabel}）` : ""}
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        {formatJstDateLabel(targetDate)} 来園向け — ルールベース予測（AI
        コストなし）／ディズニー反省（祝日二重加点抑制・園固有パス非転用）反映
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">アドバイスを準備中...</p>
      ) : advice ? (
        <div className="mt-4 space-y-4">
          <DisneyCompanion
            characterId="baymax"
            mood="speaking"
            nameJa={advice.characterNameJa}
            line={advice.headline}
          />

          {(advice.monologue?.length ?? 0) > 0 && (
            <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {advice.characterNameJa}の感想
              </h3>
              {advice.monologue.map((line) => (
                <p
                  key={line}
                  className="text-sm leading-relaxed text-slate-200"
                >
                  {line}
                </p>
              ))}
            </section>
          )}

          <div
            className={`rounded-xl border p-3 ${crowdLevelColors[advice.crowdLevel]}`}
          >
            <p className="text-sm font-medium">
              混雑スコア {advice.crowdScore} / 100
            </p>
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              回り方ヒント
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
              {advice.touringTips.map((tip) => (
                <li key={tip}>・{tip}</li>
              ))}
            </ul>
          </section>

          {(advice.cautions?.length ?? 0) > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/80">
                注意
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
                {advice.cautions.map((tip) => (
                  <li key={tip}>・{tip}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-400">
          アドバイスを取得できませんでした。
        </p>
      )}
    </div>
  );
}
