"use client";

import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyAdvice } from "@/lib/types/disney";

const priorityLabels = {
  now: "今すぐ",
  soon: "優先候補",
  later: "後で",
  skip: "見送り",
};

const priorityStyles = {
  now: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30",
  soon: "text-sky-300 bg-sky-500/15 border-sky-400/30",
  later: "text-amber-300 bg-amber-500/15 border-amber-400/30",
  skip: "text-slate-400 bg-slate-500/10 border-slate-400/20",
};

type DisneyAdvicePanelProps = {
  advice: DisneyAdvice | null;
  loading?: boolean;
  aiLoading?: boolean;
};

export default function DisneyAdvicePanel({
  advice,
  loading,
  aiLoading,
}: DisneyAdvicePanelProps) {
  if (loading || !advice) {
    return (
      <div className={`${disneyPanelClass} p-5`}>
        <p className="text-sm text-slate-400">アドバイスを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${disneyPanelClass} p-5`}>
        <h2 className="text-sm font-semibold text-white">回り方アドバイス</h2>
        <p className="mt-2 text-sm text-slate-300">{advice.summary}</p>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">
            時間帯のコツ
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {advice.timeAdvice.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-300/80">
            時期・曜日の傾向
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {advice.seasonalAdvice.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${disneyPanelClass} p-5`}>
        <h2 className="text-sm font-semibold text-white">おすすめ回り方</h2>
        <ul className="mt-3 space-y-3">
          {advice.touringPlan.map((item) => (
            <li
              key={item.attraction.id}
              className="rounded-xl border border-white/5 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">
                  {item.attraction.nameJa ?? item.attraction.name}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${priorityStyles[item.priority]}`}
                >
                  {priorityLabels[item.priority]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{item.reason}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${disneyPanelClass} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">AI パークガイド</h2>
          {advice.aiInsight?.available && advice.aiInsight.model && (
            <span className="text-[10px] uppercase tracking-wider text-fuchsia-300">
              {advice.aiInsight.model}
            </span>
          )}
        </div>

        {aiLoading && !advice.aiInsight ? (
          <p className="mt-3 text-sm text-slate-400">AI が最適ルートを分析中...</p>
        ) : advice.aiInsight?.available ? (
          <div className="mt-3 space-y-4">
            <p className="text-lg font-semibold text-white">{advice.aiInsight.headline}</p>
            <p className="text-sm leading-relaxed text-slate-300">
              {advice.aiInsight.commentary}
            </p>
            {!!advice.aiInsight.recommendedRoute?.length && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300/80">
                  おすすめルート
                </h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
                  {advice.aiInsight.recommendedRoute.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
            {!!advice.aiInsight.timingTips?.length && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                {advice.aiInsight.timingTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}
            <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-sm text-slate-300">
              {advice.aiInsight.crowdStrategy}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">
            {advice.aiInsight?.reason ??
              "AI ガイドは現在利用できません。ルールベースのアドバイスを参考にしてください。"}
          </p>
        )}
      </div>
    </div>
  );
}
