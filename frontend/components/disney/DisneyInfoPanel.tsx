"use client";

import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyAdvice } from "@/lib/types/disney";

type DisneyInfoPanelProps = {
  advice: DisneyAdvice | null;
  loading?: boolean;
  /** 過去日選択時は予想＋的中率中心のサマリー */
  isPastDay?: boolean;
};

export default function DisneyInfoPanel({
  advice,
  loading,
  isPastDay = false,
}: DisneyInfoPanelProps) {
  if (loading || !advice) {
    return (
      <div className={`${disneyPanelClass} p-5`}>
        <p className="text-sm text-slate-400">混雑情報を読み込み中...</p>
      </div>
    );
  }

  const prediction = advice.prediction;
  const accuracy = advice.accuracy;

  if (isPastDay && prediction) {
    return (
      <div className={`${disneyPanelClass} p-5`}>
        <h2 className="text-sm font-semibold text-white">混雑サマリー（予想時）</h2>
        <p className="mt-2 text-sm text-slate-300">
          予想: {prediction.crowdLabel}（Crowd Score {prediction.crowdScore}）
        </p>
        {accuracy && !accuracy.pending ? (
          <div
            className={`mt-3 rounded-xl border p-3 text-sm ${
              accuracy.levelHit
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-50"
                : "border-rose-400/25 bg-rose-500/10 text-rose-50"
            }`}
          >
            <p className="font-medium">
              的中率（この日）: {accuracy.levelHit ? "的中" : "外れ"}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-95">
              {accuracy.explanation}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">
            {accuracy?.explanation ??
              "実績スナップショット待ちのため、この日の的中率はまだ表示できません。"}
          </p>
        )}
        <p className="mt-4 text-xs text-slate-500">
          予想を改善しながら、的中率を自動的に上げていきます。
        </p>
      </div>
    );
  }

  return (
    <div className={`${disneyPanelClass} p-5`}>
      <h2 className="text-sm font-semibold text-white">混雑サマリー</h2>
      <p className="mt-2 text-sm text-slate-300">{advice.summary}</p>

      {advice.prediction?.mode === "forecast" && (
        <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-sm text-sky-100">
          <p className="font-medium">{advice.prediction.crowdLabel}</p>
          <p className="mt-1 text-xs opacity-90">{advice.prediction.description}</p>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        <span className="lg:hidden">回り方の詳細は下の「ミッキーに聞く」チャットで質問してください。</span>
        <span className="hidden lg:inline">回り方の詳細は右の「ミッキーに聞く」チャットで質問してください。</span>
      </p>
    </div>
  );
}
