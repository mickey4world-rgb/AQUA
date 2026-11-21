"use client";

import { useState } from "react";

/** 国の代表点（緯度, 経度）。攻撃元の位置表示用のおおよその中心 */
const CENTROID: Record<string, [number, number]> = {
  US: [39, -98], CA: [56, -106], MX: [23, -102], BR: [-10, -52], AR: [-34, -64], CL: [-33, -71],
  CO: [4, -73], PE: [-9, -75], VE: [7, -66], GB: [54, -2], IE: [53, -8], FR: [46, 2], DE: [51, 10],
  NL: [52, 5], BE: [50.5, 4.5], LU: [49.8, 6.1], CH: [47, 8], AT: [47.5, 14], IT: [42.8, 12.5],
  ES: [40, -4], PT: [39.5, -8], SE: [62, 15], NO: [61, 9], FI: [64, 26], DK: [56, 10], PL: [52, 19],
  CZ: [49.8, 15.5], SK: [48.7, 19.5], HU: [47, 19.5], RO: [46, 25], BG: [42.7, 25.5], GR: [39, 22],
  UA: [49, 32], BY: [53.7, 28], RU: [60, 90], TR: [39, 35], IL: [31, 35], IR: [32, 53], IQ: [33, 44],
  SA: [24, 45], AE: [24, 54], QA: [25.3, 51.2], EG: [26, 30], MA: [32, -6], DZ: [28, 3], TN: [34, 9],
  NG: [9, 8], KE: [0, 38], ZA: [-29, 24], ET: [9, 39], GH: [8, -1], IN: [22, 79], PK: [30, 70],
  BD: [24, 90], LK: [7.8, 80.7], NP: [28, 84], CN: [35, 103], HK: [22.3, 114.2], MO: [22.2, 113.5],
  TW: [23.7, 121], KR: [36.5, 127.8], KP: [40, 127], JP: [36, 138], MN: [46.8, 103], VN: [16, 107],
  TH: [15, 101], MY: [4, 102], SG: [1.35, 103.8], ID: [-2, 118], PH: [13, 122], KH: [12.5, 105],
  MM: [21, 96], LA: [18, 103], AU: [-25, 134], NZ: [-41, 174], KZ: [48, 67], UZ: [41, 64],
  AZ: [40.3, 47.7], GE: [42.3, 43.4], AM: [40.1, 45], MD: [47, 28.5], LT: [55.2, 23.9], LV: [56.9, 24.6],
  EE: [58.6, 25], RS: [44, 21], HR: [45.1, 15.2], SI: [46.1, 14.8], BA: [44, 17.7], AL: [41.1, 20.2],
  CY: [35, 33], IS: [65, -18], SC: [-4.7, 55.5], PA: [9, -80], CR: [10, -84], DO: [19, -70],
  PR: [18.2, -66.5], EC: [-1.8, -78], BO: [-17, -65], UY: [-33, -56], PY: [-23, -58],
};

const HOME: [number, number] = [35.7, 139.7];

function project([lat, lon]: [number, number]): [number, number] {
  return [lon + 180, 90 - lat];
}

export default function AttackWorldMap({
  countries,
}: {
  countries: Array<{ country: string; code: string | null; count: number }>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const placed = countries.filter((c) => c.code && CENTROID[c.code]);
  const unplaced = countries.filter((c) => !c.code || !CENTROID[c.code]);
  const unplacedTotal = unplaced.reduce((s, c) => s + c.count, 0);
  const max = Math.max(1, ...placed.map((c) => c.count));
  const [hx, hy] = project(HOME);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950">
        <svg viewBox="0 0 360 180" className="block w-full" role="img" aria-label="攻撃元の世界地図">
          <defs>
            <linearGradient id="arc-grad" x1="0" x2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id="dot-glow">
              <stop offset="0%" stopColor="#fb7185" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
            </radialGradient>
          </defs>
          {!imageFailed && (
            <image
              href="/vendor/eagle-eye/earth-day.jpg"
              x="0"
              y="0"
              width="360"
              height="180"
              preserveAspectRatio="none"
              onError={() => setImageFailed(true)}
            />
          )}
          <rect x="0" y="0" width="360" height="180" fill="#020617" opacity={imageFailed ? 1 : 0.5} />
          {[30, 60, 90, 120, 150].map((y) => (
            <line key={`lat${y}`} x1="0" x2="360" y1={y} y2={y} stroke="rgba(148,163,184,0.08)" strokeWidth="0.3" />
          ))}
          {[60, 120, 180, 240, 300].map((x) => (
            <line key={`lon${x}`} y1="0" y2="180" x1={x} x2={x} stroke="rgba(148,163,184,0.08)" strokeWidth="0.3" />
          ))}

          {placed.map((c) => {
            const [x, y] = project(CENTROID[c.code!]!);
            if (c.code === "JP") return null;
            const mx = (x + hx) / 2;
            const my = Math.min(y, hy) - Math.abs(x - hx) * 0.18 - 6;
            const w = 0.4 + (c.count / max) * 1.6;
            return (
              <path
                key={`arc-${c.code}`}
                d={`M${x},${y} Q${mx},${my} ${hx},${hy}`}
                fill="none"
                stroke="url(#arc-grad)"
                strokeWidth={w}
                strokeLinecap="round"
                opacity="0.85"
                strokeDasharray="3 2"
              >
                <animate attributeName="stroke-dashoffset" from="10" to="0" dur="1.2s" repeatCount="indefinite" />
              </path>
            );
          })}

          {placed.map((c) => {
            const [x, y] = project(CENTROID[c.code!]!);
            const r = 1.6 + Math.sqrt(c.count / max) * 5;
            return (
              <g key={`dot-${c.code}`}>
                <circle cx={x} cy={y} r={r * 2.2} fill="url(#dot-glow)">
                  <animate attributeName="r" values={`${r * 1.6};${r * 2.6};${r * 1.6}`} dur="2.4s" repeatCount="indefinite" />
                </circle>
                <circle cx={x} cy={y} r={r} fill="#f43f5e" stroke="#fff" strokeWidth="0.3">
                  <title>{`${c.country}: ${c.count} 件`}</title>
                </circle>
              </g>
            );
          })}

          <g>
            <circle cx={hx} cy={hy} r="3.2" fill="#22d3ee" stroke="#fff" strokeWidth="0.5" />
            <circle cx={hx} cy={hy} r="6" fill="none" stroke="#22d3ee" strokeWidth="0.4">
              <animate attributeName="r" values="3;9;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x={hx + 5} y={hy + 1} fontSize="5" fill="#a5f3fc">
              AQUA
            </text>
          </g>
        </svg>
        {imageFailed && (
          <p className="absolute left-3 top-3 rounded bg-rose-500/30 px-2 py-1 text-[11px] text-rose-100">
            地図画像を読み込めませんでした（位置の点と線のみ表示）
          </p>
        )}
        {placed.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg bg-slate-950/80 px-4 py-2 text-xs text-slate-300">
              国が判定できた攻撃はまだありません
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          攻撃元（大きさ＝件数）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          AQUA（日本）
        </span>
        {unplacedTotal > 0 && <span>国不明・地図外 {unplacedTotal} 件</span>}
        <span className="ml-auto">
          IP→国: <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="text-cyan-300">IP Geolocation by DB-IP</a>
        </span>
      </div>
    </div>
  );
}
