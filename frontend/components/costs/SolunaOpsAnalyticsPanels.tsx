"use client";

import { useMemo, useState } from "react";
import { costsPanelClass, formatCurrency, formatPercent } from "@/lib/analytics-utils";
import { buildEquityPerformance } from "@/lib/soluna-equity-performance";
import { clampMonthlyTargetYen } from "@/lib/soluna-asset-trade-constants";
import type {
  SolunaOpsAnalyticsReport,
  SolunaOpsDaySummary,
  SolunaOpsHourBucket,
  SolunaOpsProductMonthStat,
  SolunaOpsTradeLessonRow,
} from "@/lib/types/analytics";

type Props = {
  report: SolunaOpsAnalyticsReport;
  /** 資産運用ページ / Note・BOINC ページ */
  view: "assets" | "note-boinc";
};

function levelJa(level: string): string {
  if (level === "city") return "都市";
  if (level === "town") return "町";
  return "村";
}

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reasonJa(reason: string, reasonLabel?: string): string {
  if (reasonLabel) return reasonLabel;
  if (reason === "dca" || reason.includes("dca")) return "買い（分散召喚）";
  if (reason === "take-profit" || reason.includes("利確")) return "利確";
  if (reason === "stop-loss" || reason.includes("損切")) return "損切り";
  return reason || "—";
}

function signedYen(n: number): string {
  return `${n >= 0 ? "+" : ""}${formatCurrency(n)}`;
}

function formatUnitPrice(product: string | undefined, price: number): string {
  const code = (product ?? "BTC_JPY").replace("_JPY", "");
  if (code === "XRP" || code === "XLM") {
    return `${price.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;
  }
  return formatCurrency(price);
}

function formatHeld(product: string, held: number): string {
  if (product === "XRP_JPY" || product === "XRP") {
    return `${Math.floor(held || 0).toLocaleString("ja-JP")} XRP`;
  }
  if (product === "XLM_JPY" || product === "XLM") {
    return `${Math.floor(held || 0).toLocaleString("ja-JP")} XLM`;
  }
  if (product === "ETH_JPY" || product === "ETH") {
    return `${(held || 0).toFixed(4)} ETH`;
  }
  return `${(held || 0).toFixed(4)} BTC`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

type EquityPerf = NonNullable<
  NonNullable<SolunaOpsAnalyticsReport["assets"]>["equityPerformance"]
>;

function EquityPerformanceChart({ perf }: { perf: EquityPerf }) {
  const [range, setRange] = useState<"daily" | "weekly">("daily");
  const points = range === "weekly" ? perf.weeklyPoints : perf.points;
  const markers = perf.markers;

  const chart = useMemo(() => {
    const w = 640;
    const h = 220;
    const padL = 48;
    const padR = 16;
    const padT = 16;
    const padB = 28;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    if (points.length === 0) {
      return { w, h, padL, padT, path: "", goalPath: "", principalY: 0, ticks: [] as number[], xy: [] as Array<{ x: number; y: number; p: (typeof points)[0] }>, markerPts: [] as Array<{ x: number; y: number; m: (typeof markers)[0] }> };
    }

    const values = [
      ...points.map((p) => p.totalYen),
      ...points.map((p) => p.monthGoalTotalYen),
      perf.principalYen,
    ];
    const minV = Math.min(...values) * 0.98;
    const maxV = Math.max(...values) * 1.02;
    const span = Math.max(1, maxV - minV);

    const xAt = (i: number) =>
      padL + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const yAt = (v: number) => padT + innerH - ((v - minV) / span) * innerH;

    const xy = points.map((p, i) => ({ x: xAt(i), y: yAt(p.totalYen), p }));
    const path = xy.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const goalPath = points
      .map((p, i) => {
        const x = xAt(i);
        const y = yAt(p.monthGoalTotalYen);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const dateIndex = new Map(points.map((p, i) => [p.date, i]));
    // 日次: 同日に寄せる / 週次: その週の週末キーへ寄せる
    const markerPts = markers
      .map((m) => {
        let idx = dateIndex.get(m.date);
        if (idx === undefined && range === "weekly") {
          // 週次ポイントの date は週末。マーカー日が含まれる週を探す
          idx = points.findIndex((p) => m.date <= p.date && m.date >= (() => {
            const [y, mo, d] = p.date.split("-").map(Number);
            const start = new Date(Date.UTC(y!, mo! - 1, d! - 6));
            return start.toISOString().slice(0, 10);
          })());
          if (idx < 0) idx = undefined;
        }
        if (idx === undefined) {
          // 最も近い点
          let best = 0;
          let bestDist = Infinity;
          points.forEach((p, i) => {
            const dist = Math.abs(new Date(p.date).getTime() - new Date(m.date).getTime());
            if (dist < bestDist) {
              bestDist = dist;
              best = i;
            }
          });
          idx = best;
        }
        return { x: xAt(idx), y: yAt(m.totalYen), m };
      })
      .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minV + (span * i) / tickCount);

    return {
      w,
      h,
      padL,
      padT,
      path,
      goalPath,
      principalY: yAt(perf.principalYen),
      ticks,
      xy,
      markerPts,
      yAt,
      minV,
      maxV,
    };
  }, [points, markers, perf.principalYen, range]);

  const profitPositive = perf.pnlYen >= 0;

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            投資推移（元本 → 現在）
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {perf.startDate.replace(/-/g, "/")} 開始の現金{" "}
            {formatCurrency(perf.principalYen)} がどう変わったか。点は売買、破線は月次目標総資産。
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setRange("daily")}
            className={`rounded-md px-2.5 py-1 ${
              range === "daily" ? "bg-amber-500/25 text-amber-100" : "text-slate-400"
            }`}
          >
            日次
          </button>
          <button
            type="button"
            onClick={() => setRange("weekly")}
            className={`rounded-md px-2.5 py-1 ${
              range === "weekly" ? "bg-amber-500/25 text-amber-100" : "text-slate-400"
            }`}
          >
            週次
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] text-slate-500">現在の総魔力</p>
          <p className="text-xl font-semibold text-white">
            {formatCurrency(perf.currentTotalYen)}
          </p>
          <p className="text-[11px] text-slate-400">
            現金 {formatCurrency(perf.currentCashYen)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">元本からの損益</p>
          <p
            className={`text-xl font-semibold ${
              profitPositive ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {signedYen(perf.pnlYen)}
            <span className="ml-2 text-sm font-medium text-slate-400">
              ({perf.pnlPct >= 0 ? "+" : ""}
              {perf.pnlPct}%)
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">今月の目標総資産</p>
          <p className="text-xl font-semibold text-amber-200">
            {formatCurrency(perf.monthGoalTotalYen)}
          </p>
          <p className="text-[11px] text-slate-400">
            利益目標 {formatCurrency(perf.monthlyTargetYen)} · 実現{" "}
            {signedYen(perf.monthlyRealizedPnlYen)}
          </p>
        </div>
      </div>

      {points.length < 2 ? (
        <p className="mt-4 text-sm text-slate-500">
          推移データがまだ少ないです。次回の Asset Trade 以降、日次の点が蓄積されます。
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            className="h-auto w-full min-w-[320px]"
            role="img"
            aria-label="総資産の折れ線グラフ"
          >
            {chart.ticks.map((t) => {
              const y = chart.yAt?.(t) ?? 0;
              return (
                <g key={`tick-${t}`}>
                  <line
                    x1={chart.padL}
                    x2={chart.w - 16}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                  />
                  <text
                    x={chart.padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500"
                    fontSize="9"
                  >
                    {Math.round(t / 1000)}k
                  </text>
                </g>
              );
            })}

            {/* 元本ライン */}
            <line
              x1={chart.padL}
              x2={chart.w - 16}
              y1={chart.principalY}
              y2={chart.principalY}
              stroke="rgba(148,163,184,0.55)"
              strokeDasharray="4 4"
            />
            <text
              x={chart.w - 18}
              y={chart.principalY - 4}
              textAnchor="end"
              className="fill-slate-400"
              fontSize="9"
            >
              元本
            </text>

            {/* 月次目標総資産 */}
            <path
              d={chart.goalPath}
              fill="none"
              stroke="rgba(251,191,36,0.55)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />

            {/* 総資産 */}
            <path
              d={chart.path}
              fill="none"
              stroke={profitPositive ? "#34d399" : "#fb7185"}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {chart.xy.map((pt) => (
              <circle
                key={pt.p.date}
                cx={pt.x}
                cy={pt.y}
                r={pt.p.tradeCount > 0 ? 3.5 : 2.2}
                fill={pt.p.tradeCount > 0 ? "#fbbf24" : profitPositive ? "#34d399" : "#fb7185"}
              >
                <title>
                  {pt.p.label}: 総資産 {formatCurrency(pt.p.totalYen)} / 損益{" "}
                  {signedYen(pt.p.pnlYen)}
                  {pt.p.tradeCount > 0
                    ? ` / 約定 ${pt.p.tradeCount}件 買${formatCurrency(pt.p.buyYen)} 売${formatCurrency(pt.p.sellYen)}`
                    : ""}
                </title>
              </circle>
            ))}

            {chart.markerPts.map((pt) => {
              const buy = pt.m.side === "BUY";
              const size = 5;
              const tri = buy
                ? `${pt.x},${pt.y - size} ${pt.x - size},${pt.y + size} ${pt.x + size},${pt.y + size}`
                : `${pt.x},${pt.y + size} ${pt.x - size},${pt.y - size} ${pt.x + size},${pt.y - size}`;
              return (
                <polygon
                  key={pt.m.id}
                  points={tri}
                  fill={buy ? "#38bdf8" : "#fb7185"}
                  opacity={0.95}
                >
                  <title>
                    {formatJst(pt.m.at)} {buy ? "買" : "売"} {pt.m.product}{" "}
                    {formatCurrency(pt.m.sizeJpy)}
                    {pt.m.realizedPnlJpy !== undefined
                      ? ` / 実現 ${signedYen(pt.m.realizedPnlJpy)}`
                      : ""}
                  </title>
                </polygon>
              );
            })}

            {/* X 軸ラベル（間引き） */}
            {chart.xy
              .filter((_, i) => {
                const step = Math.max(1, Math.ceil(chart.xy.length / 6));
                return i === 0 || i === chart.xy.length - 1 || i % step === 0;
              })
              .map((pt) => (
                <text
                  key={`x-${pt.p.date}`}
                  x={pt.x}
                  y={chart.h - 8}
                  textAnchor="middle"
                  className="fill-slate-500"
                  fontSize="9"
                >
                  {pt.p.label}
                </text>
              ))}
          </svg>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{ background: profitPositive ? "#34d399" : "#fb7185" }}
          />
          総資産
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-amber-300/80" />
          月次目標総資産
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400/70" />
          元本 {formatCurrency(perf.principalYen)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-sky-300">▲</span> 買い
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-rose-300">▼</span> 売り
        </span>
      </div>
    </div>
  );
}

function DayCard({
  title,
  day,
  accent,
}: {
  title: string;
  day: SolunaOpsDaySummary;
  accent: "amber" | "cyan";
}) {
  const ring =
    accent === "cyan"
      ? "border-cyan-400/25 bg-cyan-500/5"
      : "border-amber-400/25 bg-amber-500/5";
  return (
    <div className={`rounded-xl border px-4 py-3 ${ring}`}>
      <p className="text-[11px] font-medium text-slate-300">
        {title} · {day.label}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] text-slate-500">約定</p>
          <p className="text-base font-semibold text-white">{day.tradeCount} 件</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">買付</p>
          <p className="text-base font-semibold text-sky-300">{formatCurrency(day.buyYen)}</p>
          <p className="text-[10px] text-slate-500">{day.buyCount} 回</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">売却</p>
          <p className="text-base font-semibold text-rose-300">{formatCurrency(day.sellYen)}</p>
          <p className="text-[10px] text-slate-500">{day.sellCount} 回</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">実現損益</p>
          <p
            className={`text-base font-semibold ${
              day.realizedPnlYen >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {signedYen(day.realizedPnlYen)}
          </p>
        </div>
      </div>
      {day.products.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">銘柄: {day.products.join(" / ")}</p>
      )}
      {day.tradeCount === 0 && (
        <p className="mt-2 text-[11px] text-slate-500">この日の約定はまだありません（見送り含む）。</p>
      )}
    </div>
  );
}

function HourlyChart({
  title,
  buckets,
  compactEmpty,
}: {
  title: string;
  buckets: SolunaOpsHourBucket[];
  compactEmpty?: boolean;
}) {
  const visible = compactEmpty ? buckets.filter((b) => b.tradeCount > 0) : buckets;
  const maxVol = Math.max(1, ...visible.map((b) => b.buyYen + b.sellYen));

  if (visible.length === 0 || (compactEmpty && visible.every((b) => b.tradeCount === 0))) {
    return (
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
        <p className="mt-2 text-sm text-slate-500">時間帯の約定はありません。</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        毎時の Asset Trade で約定があった時間帯を表示（HOLD のみの時間は記録なし）
      </p>
      <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 88 }}>
        {visible.map((b) => {
          const vol = b.buyYen + b.sellYen;
          const h = b.tradeCount === 0 ? 4 : Math.max(8, Math.round((vol / maxVol) * 72));
          return (
            <div key={b.hour} className="flex w-7 flex-col items-center gap-1 sm:w-8">
              <div
                className={`w-full rounded-t ${
                  b.tradeCount === 0
                    ? "bg-white/5"
                    : b.buyYen >= b.sellYen
                      ? "bg-sky-400/80"
                      : "bg-rose-400/80"
                }`}
                style={{ height: h }}
                title={`${b.label}: 買 ${b.buyYen} / 売 ${b.sellYen} / ${b.tradeCount}件`}
              />
              <span className="text-[9px] text-slate-500">{String(b.hour).padStart(2, "0")}</span>
            </div>
          );
        })}
      </div>

      <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-[12px]">
        {visible
          .filter((b) => b.tradeCount > 0)
          .map((b) => (
            <li
              key={`detail-${b.hour}`}
              className="rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-slate-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-white">{b.label}</span>
                <span className="text-slate-400">
                  {b.tradeCount}件 · 買 {formatCurrency(b.buyYen)} · 売 {formatCurrency(b.sellYen)}
                  {b.realizedPnlYen !== 0 && (
                    <> · 損益 {signedYen(b.realizedPnlYen)}</>
                  )}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                {b.actions.map((a, i) => (
                  <li key={`${b.hour}-${i}`}>
                    {a.time} {a.side === "BUY" ? "買" : "売"} {a.product}{" "}
                    {formatCurrency(a.sizeJpy)}（{reasonJa(a.reason, a.reasonLabel)}）
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}

function ProductProjectionChart({ products }: { products: SolunaOpsProductMonthStat[] }) {
  const rows = products.filter(
    (p) => p.held > 0 && p.avgBuyPriceYen != null && p.targetSellHardYen != null,
  );
  if (rows.length === 0) {
    return (
      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          銘柄別・買値→予想売値
        </p>
        <p className="mt-2 text-sm text-slate-500">
          保有がある銘柄の平均取得単価が出ると、利確目安までのグラフが表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        銘柄別・買値→予想売値
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        平均取得単価から、軟利確（+3.5%）／硬利確（+5.5%）の目安売値と想定利益を表示します。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((p) => {
          const avg = p.avgBuyPriceYen ?? 0;
          const soft = p.targetSellSoftYen ?? avg;
          const hard = p.targetSellHardYen ?? soft;
          const now = p.priceYen || avg;
          const max = Math.max(avg, soft, hard, now) * 1.02;
          const min = Math.min(avg, soft, hard, now) * 0.98;
          const span = Math.max(1, max - min);
          const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
          return (
            <div
              key={`proj-${p.product}`}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white">{p.label}</p>
                <p className="text-[11px] text-slate-400">{formatHeld(p.product, p.held)}</p>
              </div>
              <div className="relative mt-4 h-3 rounded-full bg-white/5">
                <div
                  className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-sky-500/40 via-amber-400/35 to-emerald-400/45"
                  style={{ left: `${pct(avg)}%`, width: `${Math.max(4, pct(hard) - pct(avg))}%` }}
                />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-sky-300"
                  style={{ left: `${pct(avg)}%` }}
                  title={`平均取得 ${formatUnitPrice(p.product, avg)}`}
                />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-amber-300"
                  style={{ left: `${pct(soft)}%` }}
                  title={`軟利確 ${formatUnitPrice(p.product, soft)}`}
                />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-emerald-300"
                  style={{ left: `${pct(hard)}%` }}
                  title={`硬利確 ${formatUnitPrice(p.product, hard)}`}
                />
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white"
                  style={{ left: `${pct(now)}%` }}
                  title={`現在値 ${formatUnitPrice(p.product, now)}`}
                />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div>
                  <dt className="text-slate-500">平均取得</dt>
                  <dd className="text-sky-200">{formatUnitPrice(p.product, avg)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">現在値</dt>
                  <dd className="text-white">{formatUnitPrice(p.product, now)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">軟利確目安</dt>
                  <dd className="text-amber-200">{formatUnitPrice(p.product, soft)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">硬利確目安</dt>
                  <dd className="text-emerald-200">{formatUnitPrice(p.product, hard)}</dd>
                </div>
                <div className="col-span-2 border-t border-white/5 pt-1.5">
                  <dt className="text-slate-500">想定利益（保有全部）</dt>
                  <dd className="mt-0.5 text-slate-200">
                    軟{" "}
                    <span className="text-amber-200">
                      {p.expectedProfitSoftYen != null
                        ? signedYen(p.expectedProfitSoftYen)
                        : "—"}
                    </span>
                    {" · "}硬{" "}
                    <span className="text-emerald-200">
                      {p.expectedProfitHardYen != null
                        ? signedYen(p.expectedProfitHardYen)
                        : "—"}
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

function TradeLessonsPanel({
  lessons,
  hideTitle,
}: {
  lessons: SolunaOpsTradeLessonRow[];
  hideTitle?: boolean;
}) {
  if (lessons.length === 0) {
    return (
      <div className={hideTitle ? "mt-3" : "mt-5"}>
        {!hideTitle && (
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            監査AI（直近）
          </p>
        )}
        <p className={`${hideTitle ? "" : "mt-2 "}text-sm text-slate-500`}>
          売買が実行されると、別モデルの監査結果がここに蓄積されます。
        </p>
      </div>
    );
  }

  const verdictJa = (v: SolunaOpsTradeLessonRow["verdict"]) =>
    v === "good" ? "良い判断" : v === "bad" ? "要反省" : "複合";

  return (
    <div className={hideTitle ? "mt-3" : "mt-5"}>
      {!hideTitle && (
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          監査AI（直近）
        </p>
      )}
      <p className={`${hideTitle ? "" : "mt-1 "}text-[11px] text-slate-500`}>
        良い判断は賞賛を、反省は同因が月内で複数回出たときだけ次回の売買に反映します。
      </p>
      <ul className="mt-3 space-y-2">
        {lessons.map((l) => (
          <li
            key={l.id}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[12px]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-white">
                {l.decisionAction} · {verdictJa(l.verdict)} · {l.summary}
              </p>
              <p className="text-[10px] text-slate-500">{formatJst(l.createdAt)}</p>
            </div>
            {l.praises.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-emerald-200/90">
                {l.praises.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {l.reflections.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-amber-100/85">
                {l.reflections.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SolunaOpsAnalyticsPanels({ report, view }: Props) {
  if (view === "assets") {
    return <AssetsOpsPanels report={report} />;
  }
  return <NoteBoincOpsPanels report={report} />;
}

function AssetsOpsPanels({ report }: { report: SolunaOpsAnalyticsReport }) {
  const assets = report.assets;

  const equity = useMemo(() => {
    if (!assets) return null;
    if (assets.equityPerformance?.points?.length) {
      return {
        ...assets.equityPerformance,
        monthlyTargetYen: clampMonthlyTargetYen(assets.equityPerformance.monthlyTargetYen),
      };
    }
    // 旧キャッシュ／欠損時も画面で必ず折れ線を組み立てる（沈黙の空表示を禁止）
    return buildEquityPerformance({
      principalYen: assets.principalYen,
      totalYen: assets.totalYen,
      cashYen: assets.cashYen,
      monthlyTargetYen: clampMonthlyTargetYen(assets.monthlyTargetYen),
      lastMonthTotalYen: assets.previousTotalYen,
      monthlyRealizedPnlYen: assets.monthlyRealizedPnlYen,
      monthlySummaries: (assets.monthlySummaries ?? []).map((m) => ({
        ...m,
        targetProfitYen: clampMonthlyTargetYen(m.targetProfitYen),
      })),
      trades: (assets.trades ?? []).map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        side: t.side,
        product: (t.product as "BTC_JPY" | "ETH_JPY" | "XRP_JPY" | "XLM_JPY" | "ZPG_JPY") ?? "BTC_JPY",
        sizeJpy: t.sizeJpy,
        priceBtc: t.priceBtc,
        realizedPnlJpy: t.realizedPnlJpy,
        reason: t.reason,
        briefingId: t.briefingId,
      })),
    });
  }, [assets]);

  return (
    <div className="space-y-6">
      <div className={`${costsPanelClass} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/80">
          Asset Management
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">
          {report.monthLabel} · 資産運用
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          2026年8月の元本からの損益、ポートフォリオ、売買状況をまとめて確認できます。
          {report.updatedAt && (
            <span className="ml-2 text-slate-500">
              最終更新 {formatJst(report.updatedAt)}
            </span>
          )}
        </p>
        <p className="mt-3 text-[12px] text-slate-400">
          資産運用API:{" "}
          <span className={report.bitFlyerConfigured ? "text-emerald-300" : "text-amber-300"}>
            {report.bitFlyerConfigured ? "接続設定あり" : "未設定"}
          </span>
        </p>
      </div>

      <section className={`${costsPanelClass} p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">1 · Overview</p>
            <h3 className="mt-1 text-lg font-semibold text-white">全体の損益・目標</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              元本からの利益／マイナスと、今月の目標進捗です。
            </p>
          </div>
          {assets && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">
                {assets.battleMode === "attack" ? "攻撃バフ" : "防御モード"}
              </span>
              {assets.sleepMode && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                  おやすみモード
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                status: {assets.status}
              </span>
            </div>
          )}
        </div>

        {!assets ? (
          <p className="mt-4 text-sm text-slate-400">
            まだ資産台帳がありません。API キー設定後、Asset Trade を実行すると表示されます。
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="現在の総資産"
                value={formatCurrency(assets.totalYen)}
                hint={`前日比 ${signedYen(assets.dayChangeYen)}`}
              />
              <Stat
                label="元本からの損益"
                value={equity ? signedYen(equity.pnlYen) : "—"}
                hint={
                  equity
                    ? `元本 ${formatCurrency(equity.principalYen)} · ${equity.pnlPct >= 0 ? "+" : ""}${equity.pnlPct}%`
                    : `元本 ${formatCurrency(assets.principalYen)}`
                }
              />
              <Stat
                label="現金"
                value={formatCurrency(assets.cashYen)}
                hint={`配分 ${formatPercent(assets.cashAllocationPct)}`}
              />
              <Stat
                label="月次目標進捗"
                value={formatPercent(assets.targetProgressPct)}
                hint={`${formatCurrency(assets.monthlyRealizedPnlYen)} / 目標 ${formatCurrency(clampMonthlyTargetYen(assets.monthlyTargetYen))}`}
              />
            </div>

            {equity ? (
              <EquityPerformanceChart perf={equity} />
            ) : (
              <p className="mt-4 text-sm text-rose-200">
                投資推移グラフを組み立てられませんでした。再読み込みするか、Asset Trade
                実行後に再度開いてください。
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="今月の買付" value={formatCurrency(assets.monthBuyYen)} />
              <Stat label="今月の売却" value={formatCurrency(assets.monthSellYen)} />
              <Stat
                label="今月の実現損益"
                value={signedYen(assets.monthRealizedPnlYen)}
                hint={`${assets.monthTradeCount} 件の取引`}
              />
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${assets.sleepMode ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ width: `${Math.min(100, assets.targetProgressPct)}%` }}
              />
            </div>

            {assets.monthlySummaries.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  月次サマリー
                </p>
                <ul className="mt-2 space-y-1.5 text-[12px] text-slate-300">
                  {[...assets.monthlySummaries].reverse().map((m) => (
                    <li
                      key={m.month}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/5 bg-black/10 px-3 py-2"
                    >
                      <span>{m.month}</span>
                      <span>
                        実現 {formatCurrency(m.realizedPnlYen)} / 目標{" "}
                        {formatCurrency(clampMonthlyTargetYen(m.targetProfitYen))}
                        {m.goalReached ? " · 達成" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(assets.solComment || assets.lunaComment) && (
              <div className="mt-4 space-y-1 text-[13px]">
                {assets.solComment && (
                  <p className="text-amber-50/90">⚔️ {assets.solComment}</p>
                )}
                {assets.lunaComment && (
                  <p className="text-indigo-100/90">📖 {assets.lunaComment}</p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {assets && (
        <>
          <section className={`${costsPanelClass} p-5`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">2 · Portfolio</p>
            <h3 className="mt-1 text-lg font-semibold text-white">ポートフォリオ</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              現金と暗号資産の配分（現金28%下限 · 単一42% · 暗号合計72%）
            </p>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="bg-amber-400/80"
                style={{ width: `${Math.max(0, assets.cashAllocationPct)}%` }}
                title={`現金 ${assets.cashAllocationPct}%`}
              />
              <div
                className="bg-sky-400/80"
                style={{ width: `${Math.max(0, assets.btcAllocationPct)}%` }}
                title={`BTC ${assets.btcAllocationPct}%`}
              />
              <div
                className="bg-violet-400/80"
                style={{ width: `${Math.max(0, assets.ethAllocationPct)}%` }}
                title={`ETH ${assets.ethAllocationPct}%`}
              />
              <div
                className="bg-cyan-300/80"
                style={{ width: `${Math.max(0, assets.xrpAllocationPct)}%` }}
                title={`XRP ${assets.xrpAllocationPct}%`}
              />
              <div
                className="bg-emerald-300/80"
                style={{ width: `${Math.max(0, assets.xlmAllocationPct)}%` }}
                title={`XLM ${assets.xlmAllocationPct}%`}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              <span className="text-amber-200">現金 {formatPercent(assets.cashAllocationPct)}</span>
              {" · "}
              <span className="text-sky-200">BTC {formatPercent(assets.btcAllocationPct)}</span>
              {" · "}
              <span className="text-violet-200">ETH {formatPercent(assets.ethAllocationPct)}</span>
              {" · "}
              <span className="text-cyan-200">XRP {formatPercent(assets.xrpAllocationPct)}</span>
              {" · "}
              <span className="text-emerald-200">XLM {formatPercent(assets.xlmAllocationPct)}</span>
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="現金（守護巨兵）"
                value={formatCurrency(assets.cashYen)}
                hint={`Lv.${assets.golemLevel.toFixed(1)}`}
              />
              <Stat
                label="BTC（蒼竜）"
                value={formatHeld("BTC", assets.btcHeld)}
                hint={`${formatCurrency(assets.btcValueYen)} · Lv.${assets.dragonLevel.toFixed(1)}`}
              />
              <Stat
                label="ETH（不死鳥）"
                value={formatHeld("ETH", assets.ethHeld)}
                hint={`${formatCurrency(assets.ethValueYen)} · Lv.${assets.phoenixLevel.toFixed(1)}`}
              />
              <Stat
                label="XRP / XLM"
                value={`${formatHeld("XRP", assets.xrpHeld)}`}
                hint={`${formatHeld("XLM", assets.xlmHeld)} · 海竜 Lv.${assets.seaDragonLevel.toFixed(1)} / 銀帆船 Lv.${assets.silverShipLevel.toFixed(1)}`}
              />
            </div>
            {(assets.btcPriceYen > 0 ||
              assets.ethPriceYen > 0 ||
              assets.xrpPriceYen > 0 ||
              assets.xlmPriceYen > 0) && (
              <div className="mt-4 rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-[12px] text-slate-300">
                参考価格 · BTC {formatCurrency(assets.btcPriceYen)} · ETH{" "}
                {formatCurrency(assets.ethPriceYen)} · XRP{" "}
                {formatUnitPrice("XRP_JPY", assets.xrpPriceYen)} · XLM{" "}
                {formatUnitPrice("XLM_JPY", assets.xlmPriceYen)}
              </div>
            )}
          </section>

          <section className={`${costsPanelClass} p-5`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">3 · Products</p>
            <h3 className="mt-1 text-lg font-semibold text-white">銘柄別</h3>
            <p className="mt-1 text-[11px] text-slate-500">保有・今月の売買・利確目安</p>
            {assets.byProduct?.length > 0 ? (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-slate-500">
                      <tr className="border-b border-white/10">
                        <th className="px-2 py-2 font-medium">銘柄</th>
                        <th className="px-2 py-2 font-medium">保有</th>
                        <th className="px-2 py-2 font-medium">評価額</th>
                        <th className="px-2 py-2 font-medium">配分</th>
                        <th className="px-2 py-2 font-medium">買付</th>
                        <th className="px-2 py-2 font-medium">売却</th>
                        <th className="px-2 py-2 font-medium">実現損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.byProduct.map((p) => (
                        <tr key={p.product} className="border-b border-white/5 text-slate-200">
                          <td className="px-2 py-2 font-medium text-white">{p.label}</td>
                          <td className="px-2 py-2">{formatHeld(p.product, p.held)}</td>
                          <td className="px-2 py-2">{formatCurrency(p.valueYen)}</td>
                          <td className="px-2 py-2">{formatPercent(p.allocationPct)}</td>
                          <td className="px-2 py-2 text-sky-300">
                            {formatCurrency(p.buyYen)}
                            <span className="ml-1 text-[10px] text-slate-500">{p.buyCount}回</span>
                          </td>
                          <td className="px-2 py-2 text-rose-300">
                            {formatCurrency(p.sellYen)}
                            <span className="ml-1 text-[10px] text-slate-500">{p.sellCount}回</span>
                          </td>
                          <td
                            className={`px-2 py-2 ${
                              p.realizedPnlYen >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {signedYen(p.realizedPnlYen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ProductProjectionChart products={assets.byProduct} />
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-500">銘柄データはまだありません。</p>
            )}
          </section>

          <section className={`${costsPanelClass} p-5`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">4 · Recent</p>
            <h3 className="mt-1 text-lg font-semibold text-white">前日 / 今日</h3>
            <p className="mt-1 text-[11px] text-slate-500">JST の約定サマリーと時間帯</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <DayCard title="前日" day={assets.yesterday} accent="amber" />
              <DayCard title="今日" day={assets.today} accent="cyan" />
            </div>
            <div className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-[12px] text-slate-300">
              評価額の前日比（台帳）:{" "}
              <span className={assets.dayChangeYen >= 0 ? "text-emerald-300" : "text-rose-300"}>
                {signedYen(assets.dayChangeYen)}
              </span>
              {" · "}前回総魔力 {formatCurrency(assets.previousTotalYen)} → 現在{" "}
              {formatCurrency(assets.totalYen)}
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <HourlyChart title="今日の時間帯" buckets={assets.todayHourly} />
              <HourlyChart
                title="前日の時間帯（約定ありのみ）"
                buckets={assets.yesterdayHourly}
                compactEmpty
              />
            </div>
          </section>

          <section className={`${costsPanelClass} p-5`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">5 · Trades</p>
            <h3 className="mt-1 text-lg font-semibold text-white">今月の取引明細</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              理由の <span className="text-amber-200/90">#番号</span> は「売買条件」と対応します。
            </p>
            {assets.trades.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">今月の約定はまだありません（見送り含む）。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="text-slate-500">
                    <tr className="border-b border-white/10">
                      <th className="px-2 py-2 font-medium">日時</th>
                      <th className="px-2 py-2 font-medium">銘柄</th>
                      <th className="px-2 py-2 font-medium">売買</th>
                      <th className="px-2 py-2 font-medium">金額</th>
                      <th className="px-2 py-2 font-medium">単価</th>
                      <th className="px-2 py-2 font-medium">理由（条件）</th>
                      <th className="px-2 py-2 font-medium">実現損益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.trades.map((t) => (
                      <tr key={t.id} className="border-b border-white/5 text-slate-200">
                        <td className="px-2 py-2 whitespace-nowrap">{formatJst(t.createdAt)}</td>
                        <td className="px-2 py-2">{t.product?.replace("_JPY", "") ?? "BTC"}</td>
                        <td
                          className={`px-2 py-2 font-semibold ${
                            t.side === "BUY" ? "text-sky-300" : "text-rose-300"
                          }`}
                        >
                          {t.side === "BUY" ? "買" : "売"}
                        </td>
                        <td className="px-2 py-2">{formatCurrency(t.sizeJpy)}</td>
                        <td className="px-2 py-2">{formatUnitPrice(t.product, t.priceBtc)}</td>
                        <td className="px-2 py-2">
                          <span className="text-amber-100/95">
                            {reasonJa(t.reason, t.reasonLabel)}
                          </span>
                          {t.reasonDetail && (
                            <p className="mt-0.5 max-w-md text-[10px] leading-snug text-slate-500">
                              {t.reasonDetail}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {t.realizedPnlJpy === undefined
                            ? "—"
                            : `${t.realizedPnlJpy >= 0 ? "+" : ""}${formatCurrency(t.realizedPnlJpy)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${costsPanelClass} p-5`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">6 · Audit</p>
            <h3 className="mt-1 text-lg font-semibold text-white">監査 AI</h3>
            <TradeLessonsPanel lessons={assets.tradeLessons ?? []} hideTitle />
          </section>

          {(assets.tradeRules?.length ?? 0) > 0 && (
            <section className={`${costsPanelClass} p-5`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">7 · Rules</p>
              <h3 className="mt-1 text-lg font-semibold text-white">売買条件</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                取引明細の理由に付く番号と対応。複数条件は{" "}
                <span className="text-amber-200/90">#8+#2</span> のように連結します。
              </p>
              <ol className="mt-4 space-y-2">
                {(assets.tradeRules ?? []).map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-lg border border-white/8 bg-black/15 px-3 py-2 text-[12px] text-slate-300"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-amber-200">#{rule.id}</span>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {rule.categoryLabel}
                      </span>
                      <span className="font-medium text-white">{rule.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{rule.summary}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function NoteBoincOpsPanels({ report }: { report: SolunaOpsAnalyticsReport }) {
  const note = report.note;
  const boinc = report.boinc;
  const settlement = report.settlement;

  return (
    <div className="space-y-6">
      <div className={`${costsPanelClass} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
          Soluna Ops
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">
          {report.monthLabel} · Note・BOINC
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          有料 Note の投稿状況と、BOINC 解析パワー（拠点都市）の実績です。
          {report.updatedAt && (
            <span className="ml-2 text-slate-500">
              最終更新 {formatJst(report.updatedAt)}
            </span>
          )}
        </p>
        <p className="mt-3 text-[12px] text-slate-400">
          Note:{" "}
          <span className={note?.configured ? "text-emerald-300" : "text-amber-300"}>
            {note?.configured ? "Cookie 設定あり" : "未設定"}
          </span>
        </p>
      </div>

      {note && (
        <section className={`${costsPanelClass} p-5`}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-300/80">Note</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Note 投稿・アクセス</h3>
            <p className="mt-1 text-sm text-slate-400">
              朝ブリーフィングの自動投稿実績と、note ダッシュボード相当の PV / スキです。
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="今月の公開"
              value={`${note.monthPublishCount} 本`}
              hint={
                note.monthPaidPublishCount > 0
                  ? `有料 ${note.monthPaidPublishCount} · 失敗/未公開 ${note.monthDraftOrFailedCount}`
                  : `失敗/未公開 ${note.monthDraftOrFailedCount}`
              }
            />
            <Stat
              label="直近公開"
              value={note.latestPublishedAt ? formatJst(note.latestPublishedAt) : "—"}
              hint={note.latestTitle ?? undefined}
            />
            <Stat
              label="今月の PV"
              value={note.monthViewCount != null ? note.monthViewCount.toLocaleString("ja-JP") : "—"}
              hint={
                note.lifetimeViewCount != null
                  ? `累計 ${note.lifetimeViewCount.toLocaleString("ja-JP")}`
                  : note.pvError ?? undefined
              }
            />
            <Stat
              label="有料利用"
              value={note.paidSalesCount != null ? `${note.paidSalesCount} 件` : "未取得"}
              hint={note.paidSalesNote}
            />
          </div>

          {note.latestNoteUrl && (
            <a
              href={note.latestNoteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[12px] text-fuchsia-200 underline"
            >
              直近の記事を開く
            </a>
          )}
          {note.creatorUrl && (
            <a
              href={note.creatorUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 ml-3 inline-block text-[12px] text-slate-400 underline"
            >
              クリエイターページ
            </a>
          )}

          {note.articles.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                今月の投稿ログ（アプリ台帳）
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">日時</th>
                      <th className="py-1.5 pr-3 font-medium">タイトル</th>
                      <th className="py-1.5 pr-3 font-medium">状態</th>
                      <th className="py-1.5 pr-3 font-medium">価格</th>
                      <th className="py-1.5 pr-3 font-medium">PV</th>
                      <th className="py-1.5 font-medium">スキ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {note.articles.map((a) => (
                      <tr key={a.id} className="border-t border-white/5">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {a.createdAt ? formatJst(a.createdAt) : "—"}
                        </td>
                        <td className="py-1.5 pr-3 max-w-[220px] truncate">
                          {a.noteUrl ? (
                            <a
                              href={a.noteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-fuchsia-200 underline"
                            >
                              {a.title}
                            </a>
                          ) : (
                            a.title
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.published ? "公開" : a.error ? "失敗" : "未公開"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.priceYen != null && a.priceYen > 0 ? `${a.priceYen}円` : "無料"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.viewCount != null ? a.viewCount.toLocaleString("ja-JP") : "—"}
                        </td>
                        <td className="py-1.5">
                          {a.likeCount != null ? a.likeCount.toLocaleString("ja-JP") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {note.topByViews.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                note 側 PV 上位（月間）
              </p>
              <ul className="mt-2 space-y-1.5 text-[12px] text-slate-300">
                {note.topByViews.slice(0, 8).map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/5 bg-black/15 px-3 py-2"
                  >
                    <span className="truncate">
                      {a.noteUrl ? (
                        <a
                          href={a.noteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-fuchsia-200 underline"
                        >
                          {a.title}
                        </a>
                      ) : (
                        a.title
                      )}
                    </span>
                    <span className="text-slate-400 whitespace-nowrap">
                      PV {a.viewCount?.toLocaleString("ja-JP") ?? "—"}
                      {a.likeCount != null && ` · スキ ${a.likeCount}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className={`${costsPanelClass} p-5`}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">BOINC</p>
          <h3 className="mt-1 text-lg font-semibold text-white">社会貢献・解析パワー</h3>
          <p className="mt-1 text-sm text-slate-400">
            討伐後の宇宙分析稼働と、拠点都市アクアピアへの変換状況です。
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="今月の稼働（実績）"
            value={`${boinc.monthActualMinutes} 分`}
            hint={`計画 ${boinc.monthPlannedMinutes} 分 · ${boinc.monthRunCount} 回`}
          />
          <Stat
            label="今月のクレジット"
            value={`${boinc.monthCreditGranted} cs`}
            hint={`タスク ${boinc.monthTasksCompleted} 件`}
          />
          <Stat
            label="累計稼働（実績）"
            value={`${boinc.lifetimeActualMinutes} 分`}
            hint={`計画累計 ${boinc.lifetimePlannedMinutes} 分`}
          />
          <Stat
            label="累計クレジット"
            value={`${boinc.lifetimeCreditGranted} cs`}
            hint={`タスク累計 ${boinc.lifetimeTasksCompleted} 件`}
          />
        </div>

        {settlement && (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">拠点都市</p>
            <p className="mt-1 text-base font-semibold text-white">
              {settlement.settlementName}（{levelJa(settlement.settlementLevel)}）
            </p>
            <p className="mt-1 text-[12px] text-emerald-50/90">
              累積開拓パワー {settlement.cumulativeMinutes} 分 · 宇宙分析スロット{" "}
              {settlement.analysisSlots}
            </p>
            {settlement.latestHeadline && (
              <p className="mt-2 text-[13px] text-emerald-100">{settlement.latestHeadline}</p>
            )}
            {settlement.latestTopic && (
              <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{settlement.latestTopic}</p>
            )}
            {settlement.facilities.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12px] text-slate-300">
                {settlement.facilities.map((f) => (
                  <li key={f.id}>
                    · {f.name}（{f.location} / {f.levelLabel}）
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            実行履歴
          </p>
          {boinc.runs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">BOINC 実行履歴はまだありません。</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-2 font-medium">日時</th>
                    <th className="px-2 py-2 font-medium">計画</th>
                    <th className="px-2 py-2 font-medium">実績</th>
                    <th className="px-2 py-2 font-medium">クレジット</th>
                    <th className="px-2 py-2 font-medium">タスク</th>
                    <th className="px-2 py-2 font-medium">状態</th>
                    <th className="px-2 py-2 font-medium">プロジェクト</th>
                  </tr>
                </thead>
                <tbody>
                  {boinc.runs.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 text-slate-200">
                      <td className="px-2 py-2 whitespace-nowrap">{formatJst(r.createdAt)}</td>
                      <td className="px-2 py-2">{r.plannedMinutes} 分</td>
                      <td className="px-2 py-2">
                        {r.actualMinutes === null ? "—" : `${r.actualMinutes} 分`}
                      </td>
                      <td className="px-2 py-2">
                        {r.creditGranted === null ? "—" : `${r.creditGranted} cs`}
                      </td>
                      <td className="px-2 py-2">
                        {r.tasksCompleted === null ? "—" : r.tasksCompleted}
                      </td>
                      <td className="px-2 py-2">{r.status}</td>
                      <td className="px-2 py-2">
                        {r.projectUrl ? (
                          <a
                            href={r.projectUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 underline"
                          >
                            {r.projectName ?? "project"}
                          </a>
                        ) : (
                          r.projectName ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
