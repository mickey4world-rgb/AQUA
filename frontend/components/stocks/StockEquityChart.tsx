"use client";

import { useMemo } from "react";
import type { StockEquityPerformance } from "@/lib/stock-equity-performance";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

function signedYen(n: number): string {
  const abs = formatYen(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

type Props = {
  perf: StockEquityPerformance;
};

/** 元本 + 累積実現損益の折れ線（仮想通貨 Soluna と同型） */
export default function StockEquityChart({ perf }: Props) {
  const points = perf.points;
  const markers = perf.markers;
  const profitPositive = perf.pnlYen >= 0;

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
      return {
        w,
        h,
        padL,
        path: "",
        goalPath: "",
        principalY: 0,
        ticks: [] as number[],
        xy: [] as Array<{ x: number; y: number; p: (typeof points)[0] }>,
        markerPts: [] as Array<{
          x: number;
          y: number;
          m: (typeof markers)[0];
        }>,
        yAt: (_v: number) => 0,
      };
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
    const path = xy
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(" ");
    const goalPath = points
      .map((p, i) => {
        const x = xAt(i);
        const y = yAt(p.monthGoalTotalYen);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const dateIndex = new Map(points.map((p, i) => [p.date, i]));
    const markerPts = markers
      .map((m) => {
        let idx = dateIndex.get(m.date);
        if (idx === undefined) {
          let best = 0;
          let bestDist = Infinity;
          points.forEach((p, i) => {
            const dist = Math.abs(
              new Date(p.date).getTime() - new Date(m.date).getTime(),
            );
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
    const ticks = Array.from(
      { length: tickCount + 1 },
      (_, i) => minV + (span * i) / tickCount,
    );

    return {
      w,
      h,
      padL,
      path,
      goalPath,
      principalY: yAt(perf.principalYen),
      ticks,
      xy,
      markerPts,
      yAt,
    };
  }, [points, markers, perf.principalYen]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 sm:px-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          実現損益の推移（元本 → 現在）
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          売りで確定した損益だけを積み上げます（保有の時価は含めません）。破線は月次目標（元本の
          2%）、点は売買。
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] text-slate-500">実現ベース（元本+累積実現）</p>
          <p className="text-xl font-semibold text-white">
            {formatYen(perf.currentTotalYen)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">累積実現損益</p>
          <p
            className={`text-xl font-semibold ${
              profitPositive ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {signedYen(perf.pnlYen)}
            <span className="ml-2 text-sm font-medium text-slate-400">
              ({perf.pnlPct >= 0 ? "+" : ""}
              {perf.pnlPct.toFixed(2)}%)
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">今月の売り益目標</p>
          <p className="text-xl font-semibold text-amber-200">
            {formatYen(perf.monthlyTargetYen)}
          </p>
          <p className="text-[11px] text-slate-400">
            今月の実現 {signedYen(perf.monthlyRealizedPnlYen)} · 達成{" "}
            {Math.max(0, perf.monthlyProgressPct).toFixed(0)}%
          </p>
        </div>
      </div>

      {points.length < 2 ? (
        <p className="mt-4 text-sm text-slate-500">
          推移データがまだ少ないです。dry-run／発注ログが溜まると折れ線が伸びます。
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            className="h-auto w-full min-w-[320px]"
            role="img"
            aria-label="日本株・元本対比の実現損益グラフ"
          >
            {chart.ticks.map((t) => {
              const y = chart.yAt(t);
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

            <path
              d={chart.goalPath}
              fill="none"
              stroke="rgba(251,191,36,0.55)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />

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
                fill={
                  pt.p.tradeCount > 0
                    ? "#fbbf24"
                    : profitPositive
                      ? "#34d399"
                      : "#fb7185"
                }
              >
                <title>
                  {pt.p.label}: 実現ベース {formatYen(pt.p.totalYen)} / 累積実現{" "}
                  {signedYen(pt.p.pnlYen)}
                </title>
              </circle>
            ))}

            {chart.markerPts.map((pt) => {
              const buy = pt.m.side === "buy";
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
                    {buy ? "買" : "売"} {pt.m.symbol}
                    {pt.m.realizedPnlJpy !== undefined
                      ? ` / 実現 ${signedYen(pt.m.realizedPnlJpy)}`
                      : ""}
                  </title>
                </polygon>
              );
            })}

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
          実現ベース
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded border border-dashed border-amber-400/70" />
          月次目標（元本+2%）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded border border-dashed border-slate-400/70" />
          元本
        </span>
      </div>
    </div>
  );
}
