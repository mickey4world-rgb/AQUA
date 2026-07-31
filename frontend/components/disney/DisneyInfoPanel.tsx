"use client";

import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyAdvice } from "@/lib/types/disney";

type DisneyInfoPanelProps = {
  advice: DisneyAdvice | null;
  loading?: boolean;
};

export default function DisneyInfoPanel({ advice, loading }: DisneyInfoPanelProps) {
  if (loading || !advice) {
    return (
      <div className={`${disneyPanelClass} p-5`}>
        <p className="text-sm text-slate-400">混雑情報を読み込み中...</p>
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
        回り方の詳細は右の「ミッキーに聞く」チャットで質問してください。
      </p>
    </div>
  );
}
