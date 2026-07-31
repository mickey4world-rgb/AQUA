"use client";

import {
  displayTicker,
  formatPrice,
  marketLabel,
} from "@/lib/stock-utils";
import type { StockWatchWithAdvice } from "@/lib/types/stock";

const actionStyles = {
  hold: "bg-blue-100 text-blue-800 border-blue-200",
  buy: "bg-emerald-100 text-emerald-800 border-emerald-200",
  sell: "bg-red-100 text-red-800 border-red-200",
  watch: "bg-amber-100 text-amber-800 border-amber-200",
};

const actionLabels = {
  hold: "保有継続",
  buy: "買い検討",
  sell: "売り検討",
  watch: "様子見",
};

type StockWatchDetailProps = {
  watch: StockWatchWithAdvice;
  onDelete: (id: string) => void;
};

export default function StockWatchDetail({
  watch,
  onDelete,
}: StockWatchDetailProps) {
  const advice = watch.advice;
  const action = advice?.action ?? "watch";
  const market = watch.market ?? "us";
  const displayName = watch.name || advice?.companyName;

  function formatDate(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500">{marketLabel(market)}</p>
          <h3 className="text-xl font-bold text-zinc-900">
            {displayName ? (
              <>
                {displayName}
                <span className="ml-2 text-base font-medium text-zinc-500">
                  {displayTicker(watch.ticker, market)}
                </span>
              </>
            ) : (
              displayTicker(watch.ticker, market)
            )}
          </h3>
          {watch.memo && (
            <p className="mt-1 text-sm text-zinc-500">{watch.memo}</p>
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

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">購入価格</dt>
          <dd className="font-medium">{formatPrice(watch.buyPrice, market)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">目標株価</dt>
          <dd className="font-medium">{formatPrice(watch.targetPrice, market)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">保有株数</dt>
          <dd className="font-medium">{watch.shares || "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">倍率</dt>
          <dd className="font-medium">{watch.targetMultiplier}x</dd>
        </div>
      </dl>

      {advice ? (
        <div className="mt-4 rounded-md bg-zinc-50 p-4">
          <p className="font-medium text-zinc-900">{advice.summary}</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>現在株価: {formatPrice(advice.currentPrice, market)}</p>
            <p>
              前日比: {advice.changePct >= 0 ? "+" : ""}
              {advice.changePct.toFixed(2)}%
            </p>
            <p>MA5: {formatPrice(advice.ma5, market)}</p>
            <p>MA25: {formatPrice(advice.ma25, market)}</p>
            <p>
              損益: {advice.profitPct >= 0 ? "+" : ""}
              {advice.profitPct.toFixed(1)}%
            </p>
            <p>目標まで: {advice.distanceToTargetPct.toFixed(1)}%</p>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {advice.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {advice.priceChangeContext.length > 0 && (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <h4 className="text-sm font-semibold text-zinc-900">
                株価変動の背景
              </h4>
              <ul className="mt-2 space-y-2">
                {advice.priceChangeContext.map((item) => (
                  <li key={`${item.kind}-${item.title}`} className="text-sm">
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <p className="font-medium text-zinc-800">{item.title}</p>
                    )}
                    <p className="text-xs text-zinc-500">
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
        <p className="mt-4 text-sm text-zinc-500">
          株価データを取得できませんでした
        </p>
      )}

      <button
        type="button"
        onClick={() => onDelete(watch.id)}
        className="mt-4 text-sm text-red-600 hover:text-red-800"
      >
        削除
      </button>
    </div>
  );
}
