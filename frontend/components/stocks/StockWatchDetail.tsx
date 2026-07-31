"use client";

import { MarketBadge } from "@/components/stocks/StocksPageShell";
import {
  calcCostBasis,
  calcMarketValue,
  calcProfitAmount,
  displayTicker,
  formatPrice,
  formatSignedPrice,
  marketLabel,
  stockPanelClass,
} from "@/lib/stock-utils";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

const actionStyles = {
  hold: "border-sky-400/30 bg-sky-500/15 text-sky-300",
  buy: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
  sell: "border-rose-400/30 bg-rose-500/15 text-rose-300",
  watch: "border-amber-400/30 bg-amber-500/15 text-amber-300",
};

const actionLabels = {
  hold: "保有継続",
  buy: "買い検討",
  sell: "売り検討",
  watch: "様子見",
};

const confidenceLabels = {
  high: "高",
  medium: "中",
  low: "低",
};

type StockWatchDetailProps = {
  watch: StockWatchWithAdvice;
  aiLoading?: boolean;
  onDelete: (id: string) => void;
};

export default function StockWatchDetail({
  watch,
  aiLoading = false,
  onDelete,
}: StockWatchDetailProps) {
  const advice = watch.advice;
  const action = advice?.action ?? "watch";
  const market = watch.market ?? "us";
  const displayName = watch.name || advice?.companyName;
  const hasShares = watch.shares > 0;
  const marketValue =
    advice && hasShares ? calcMarketValue(advice.currentPrice, watch.shares) : null;
  const costBasis = hasShares ? calcCostBasis(watch.buyPrice, watch.shares) : null;
  const profitAmount =
    advice && hasShares
      ? calcProfitAmount(advice.currentPrice, watch.buyPrice, watch.shares)
      : null;

  function formatDate(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className={`${stockPanelClass} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {marketLabel(market)}
            </p>
            <MarketBadge market={market} />
          </div>
          <h3 className="mt-1 text-2xl font-bold text-white">
            {displayName ? (
              <>
                {displayName}
                <span className="ml-2 text-base font-medium text-slate-400">
                  {displayTicker(watch.ticker, market)}
                </span>
              </>
            ) : (
              displayTicker(watch.ticker, market)
            )}
          </h3>
          {watch.memo && (
            <p className="mt-1 text-sm text-slate-400">{watch.memo}</p>
          )}
        </div>
        {advice && (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${actionStyles[action]}`}
          >
            {actionLabels[action]}
          </span>
        )}
      </div>

      {advice && (
        <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-slate-900/40 to-violet-500/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            Sell Now Estimate
          </p>
          {marketValue !== null && costBasis !== null && profitAmount !== null ? (
            <>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white">
                {formatPrice(marketValue, market)}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                今売却した場合の受取額（{watch.shares.toLocaleString("ja-JP")} 株 ×{" "}
                {formatPrice(advice.currentPrice, market)}）
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <div>
                  <p className="text-slate-500">購入コスト</p>
                  <p className="font-medium text-slate-200">
                    {formatPrice(costBasis, market)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">含み損益</p>
                  <p
                    className={`font-semibold ${
                      profitAmount >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatSignedPrice(profitAmount, market)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">損益率</p>
                  <p
                    className={`font-semibold ${
                      advice.profitPct >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {advice.profitPct >= 0 ? "+" : ""}
                    {advice.profitPct.toFixed(1)}%
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              保有株数を登録すると、今売却した場合の受取額を表示します。
            </p>
          )}
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["購入価格", formatPrice(watch.buyPrice, market)],
          ["目標株価", formatPrice(watch.targetPrice, market)],
          ["保有株数", watch.shares ? watch.shares.toLocaleString("ja-JP") : "—"],
          ["倍率", `${watch.targetMultiplier}x`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-white/5 bg-white/5 px-3 py-2"
          >
            <dt className="text-slate-500">{label}</dt>
            <dd className="mt-1 font-medium text-white">{value}</dd>
          </div>
        ))}
      </dl>

      {advice ? (
        <div className="mt-5 rounded-2xl border border-white/5 bg-slate-950/40 p-4">
          <p className="font-medium text-slate-100">{advice.summary}</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <p>現在株価: {formatPrice(advice.currentPrice, market)}</p>
            <p>
              前日比:{" "}
              <span
                className={
                  advice.changePct >= 0 ? "text-emerald-400" : "text-rose-400"
                }
              >
                {advice.changePct >= 0 ? "+" : ""}
                {advice.changePct.toFixed(2)}%
              </span>
            </p>
            <p>MA5: {formatPrice(advice.ma5, market)}</p>
            <p>MA25: {formatPrice(advice.ma25, market)}</p>
            <p>
              目標まで: {advice.distanceToTargetPct.toFixed(1)}%
            </p>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {advice.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {advice.priceChangeContext.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <h4 className="text-sm font-semibold text-white">株価変動の背景</h4>
              <ul className="mt-2 space-y-2">
                {advice.priceChangeContext.map((item) => (
                  <li key={`${item.kind}-${item.title}`} className="text-sm">
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <p className="font-medium text-slate-200">{item.title}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      {item.kind === "development" ? "重要イベント" : "ニュース"}
                      {item.source ? ` · ${item.source}` : ""}
                      {item.publishedAt ? ` · ${formatDate(item.publishedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-400">
          株価データを取得できませんでした
        </p>
      )}

      {advice && (
        <div className="mt-5 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-slate-950/40 to-cyan-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-violet-200">AI 売買アドバイス</h4>
            {advice.aiInsight?.available && advice.aiInsight.model && (
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-200">
                Azure OpenAI · {advice.aiInsight.model}
              </span>
            )}
          </div>

          {aiLoading && !advice.aiInsight ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300" />
              AI がニュースとテクニカルを分析中...
            </div>
          ) : advice.aiInsight?.available ? (
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-lg font-semibold text-white">
                  {advice.aiInsight.headline}
                </p>
                {advice.aiInsight.confidence && (
                  <p className="mt-1 text-xs text-slate-400">
                    確信度: {confidenceLabels[advice.aiInsight.confidence]}
                  </p>
                )}
              </div>
              <p className="text-sm leading-relaxed text-slate-200">
                {advice.aiInsight.commentary}
              </p>
              <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  判定の補足
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {advice.aiInsight.actionRationale}
                </p>
              </div>
              {!!advice.aiInsight.catalysts?.length && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300/80">
                    注目材料
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {advice.aiInsight.catalysts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!advice.aiInsight.risks?.length && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-300/80">
                    リスク
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                    {advice.aiInsight.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              {advice.aiInsight?.reason ??
                "AI 分析は現在利用できません。テクニカル分析のみ表示しています。"}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onDelete(watch.id)}
        className="mt-5 text-sm text-rose-400 transition hover:text-rose-300"
      >
        この銘柄を削除
      </button>
    </div>
  );
}
