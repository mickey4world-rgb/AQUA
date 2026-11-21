"use client";

import type { ReactNode } from "react";

export const glassPanel =
  "relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-950/80 to-slate-950/90 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl";

export function formatJst(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    ...(withYear ? { year: "numeric" } : {}),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

export function SectionHeader({
  step,
  title,
  subtitle,
  accent = "from-rose-400 to-fuchsia-400",
  right,
}: {
  step: string;
  title: string;
  subtitle?: string;
  accent?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent} font-mono text-sm font-bold text-slate-950 shadow-lg`}
        >
          {step}
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export type DonutSegment = { label: string; value: number; color: string };

export function Donut({
  segments,
  size = 120,
  thickness = 14,
  center,
  sub,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  center: ReactNode;
  sub?: ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${s.color}66)` }}
                >
                  <title>{`${s.label}: ${s.value}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-2xl font-semibold text-white">{center}</div>
        {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

export function Legend({ segments }: { segments: DonutSegment[] }) {
  return (
    <ul className="space-y-1.5 text-xs">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
            {s.label}
          </span>
          <span className="font-mono text-slate-100">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** 日別件数の面グラフ（月内の全日を埋める） */
export function AreaChart({
  points,
  height = 120,
  color = "#fb7185",
}: {
  points: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
}) {
  const width = 600;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = Math.max(1, points.length - 1);
  const xy = points.map((p, i) => [
    (i / n) * width,
    height - 8 - (p.value / max) * (height - 24),
  ]);
  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gid = `area-${color.replace("#", "")}`;
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0] ?? { label: "", value: 0 });
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={width} y1={height * f} y2={height * f} stroke="rgba(255,255,255,0.05)" />
        ))}
        {points.length > 1 && <path d={area} fill={`url(#${gid})`} />}
        {points.length > 1 && (
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{points[0]?.label ?? ""}</span>
        {peak && peak.value > 0 && (
          <span className="text-rose-200">
            最大 {peak.label}：{peak.value} 件
          </span>
        )}
        <span>{points[points.length - 1]?.label ?? ""}</span>
      </div>
    </div>
  );
}

export function HBar({
  label,
  value,
  max,
  gradient = "from-rose-500 to-amber-300",
  hint,
}: {
  label: ReactNode;
  value: number;
  max: number;
  gradient?: string;
  hint?: ReactNode;
}) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="truncate text-slate-200">{label}</span>
        <span className="font-mono text-slate-100">{value.toLocaleString("ja-JP")}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/** 攻撃元（行）× 攻撃場所（列）のヒートマップ */
export function Heatmap({
  rows,
  cols,
  value,
}: {
  rows: string[];
  cols: Array<{ key: string; label: string }>;
  value: (row: string, col: string) => number;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => value(r, c.key))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-medium text-slate-500">攻撃元 ＼ 場所</th>
            {cols.map((c) => (
              <th key={c.key} className="px-1 py-1 text-center font-medium text-slate-400">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-200">{r}</td>
              {cols.map((c) => {
                const v = value(r, c.key);
                const a = v === 0 ? 0 : 0.15 + 0.85 * (v / max);
                return (
                  <td
                    key={c.key}
                    title={`${r} → ${c.label}: ${v} 件`}
                    className="h-9 min-w-[3.5rem] rounded-md text-center font-mono"
                    style={{
                      background: v === 0 ? "rgba(255,255,255,0.03)" : `rgba(244,63,94,${a.toFixed(2)})`,
                      color: a > 0.55 ? "#fff" : "rgb(226,232,240)",
                      boxShadow: a > 0.7 ? "0 0 14px rgba(244,63,94,0.45)" : undefined,
                    }}
                  >
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  tone = "neutral",
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  children?: ReactNode;
}) {
  const ring =
    tone === "bad"
      ? "from-rose-500/40"
      : tone === "warn"
        ? "from-amber-400/40"
        : tone === "good"
          ? "from-emerald-400/40"
          : "from-cyan-400/25";
  const text =
    tone === "bad"
      ? "text-rose-100"
      : tone === "warn"
        ? "text-amber-100"
        : tone === "good"
          ? "text-emerald-100"
          : "text-white";
  return (
    <div className={`${glassPanel} p-4`}>
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${ring} to-transparent blur-2xl`} />
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-semibold ${text}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>}
      </p>
      {children}
    </div>
  );
}
