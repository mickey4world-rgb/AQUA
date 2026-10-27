"use client";

import type {
  StockPortfolioOverview,
  StockProductProjection,
} from "@/lib/stock-portfolio-overview";
import { STOCK_SOFT_TAKE_PROFIT_RATE } from "@/lib/stock-portfolio-overview";
import { STOCK_HARD_TAKE_PROFIT_MULT } from "@/lib/stock-trade-constants";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

function signedYen(n: number): string {
  const abs = formatYen(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function formatPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function Stat({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold text-white ${valueClass ?? ""}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ProductProjectionChart({
  products,
}: {
  products: StockProductProjection[];
}) {
  const softPct = (STOCK_SOFT_TAKE_PROFIT_RATE * 100).toFixed(0);
  const hardPct = ((STOCK_HARD_TAKE_PROFIT_MULT - 1) * 100).toFixed(0);

  if (products.length === 0) {
    return (
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          銘柄別・買値→予想売値
        </p>
        <p className="mt-2 text-sm text-slate-500">
          保有がある銘柄の平均取得単価が出ると、利確目安までのグラフが表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        銘柄別・買値→予想売値
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        平均取得単価から、軟利確（+{softPct}% または目標の95%）／硬利確（ウォッチ目標または +
        {hardPct}%）の目安売値と想定利益を表示します。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {products.map((p) => {
          const avg = p.avgBuyPriceYen;
          const soft = p.targetSellSoftYen;
          const hard = p.targetSellHardYen;
          const now = p.priceYen || avg;
          const max = Math.max(avg, soft, hard, now) * 1.02;
          const min = Math.min(avg, soft, hard, now) * 0.98;
          const span = Math.max(1, max - min);
          const pct = (v: number) =>
            Math.max(0, Math.min(100, ((v - min) / span) * 100));
          return (
            <div
              key={`proj-${p.symbol}`}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  {p.label}{" "}
                  <span className="font-mono text-[11px] text-slate-400">
                    {p.symbol}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  {p.heldQty.toLocaleString("ja-JP")}株
                </p>
              </div>
              {p.avgBuyEstimated && (
                <p className="mt-1 text-[10px] text-amber-200/80">
                  取得単価不明 · 現在値を仮の買値として表示
                </p>
              )}
              <div className="relative mt-4 h-3 rounded-full bg-white/5">
                <div
                  className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-sky-500/40 via-amber-400/35 to-emerald-400/45"
                  style={{
                    left: `${pct(avg)}%`,
                    width: `${Math.max(4, pct(hard) - pct(avg))}%`,
                  }}
                />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-sky-300"
                  style={{ left: `${pct(avg)}%` }}
                  title={`平均取得 ${formatYen(avg)}`}
                />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-amber-300"
                  style={{ left: `${pct(soft)}%` }}
                  title={`軟利確 ${formatYen(soft)}`}
                />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-emerald-300"
                  style={{ left: `${pct(hard)}%` }}
                  title={`硬利確 ${formatYen(hard)}`}
                />
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white"
                  style={{ left: `${pct(now)}%` }}
                  title={`現在値 ${formatYen(now)}`}
                />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div>
                  <dt className="text-slate-500">
                    {p.avgBuyEstimated ? "仮の取得（現在値）" : "平均取得"}
                  </dt>
                  <dd className="text-sky-200">{formatYen(avg)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">現在値</dt>
                  <dd className="text-white">{formatYen(now)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">軟利確目安</dt>
                  <dd className="text-amber-200">{formatYen(soft)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">硬利確目安</dt>
                  <dd className="text-emerald-200">{formatYen(hard)}</dd>
                </div>
                <div className="col-span-2 border-t border-white/5 pt-1.5">
                  <dt className="text-slate-500">想定利益（保有全部）</dt>
                  <dd className="mt-0.5 text-slate-200">
                    軟{" "}
                    <span className="text-amber-200">
                      {signedYen(p.expectedProfitSoftYen)}
                    </span>
                    {" · "}硬{" "}
                    <span className="text-emerald-200">
                      {signedYen(p.expectedProfitHardYen)}
                    </span>
                    {" · "}含み{" "}
                    <span
                      className={
                        p.unrealizedPnlYen >= 0
                          ? "text-emerald-200"
                          : "text-rose-300"
                      }
                    >
                      {signedYen(p.unrealizedPnlYen)}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  overview: StockPortfolioOverview;
  products: StockProductProjection[];
};

/** 仮想通貨タブと同型: 概要4指標 + 銘柄別買値→予想売値 */
export default function StockPortfolioOverviewPanel({
  overview,
  products,
}: Props) {
  const progress = Math.max(0, Math.min(100, overview.targetProgressPct));
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          全体の損益・目標
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          仮想通貨タブと同じく、時価総資産・累積実現・現金・月次目標進捗です。実現は売りの確定損益のみ（含みは含めません）。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="現在の総資産（時価）"
          value={formatYen(overview.totalYen)}
          hint={`保有 ${formatYen(overview.holdingsValueYen)} · 現金配分 ${overview.cashAllocationPct.toFixed(0)}%`}
        />
        <Stat
          label="累積実現損益"
          value={signedYen(overview.realizedPnlYen)}
          valueClass={
            overview.realizedPnlYen >= 0 ? "text-emerald-300" : "text-rose-300"
          }
          hint={`実現ベース ${formatYen(overview.realizedBaseYen)} · ${formatPercent(overview.realizedPnlPct)}`}
        />
        <Stat
          label="現金"
          value={formatYen(overview.cashYen)}
          hint={`配分 ${overview.cashAllocationPct.toFixed(1)}%`}
        />
        <Stat
          label="月次目標進捗"
          value={formatPercent(overview.targetProgressPct)}
          hint={`${signedYen(overview.monthlyRealizedPnlYen)} / 目標 ${formatYen(overview.monthlyTargetYen)}`}
        />
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${
            overview.targetProgressPct >= 100
              ? "bg-emerald-400"
              : overview.targetProgressPct >= 0
                ? "bg-amber-400"
                : "bg-rose-400/80"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <ProductProjectionChart products={products} />
    </div>
  );
}
