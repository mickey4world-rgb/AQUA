"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { formatDistanceKm, spacePanelClass } from "@/lib/space-utils";
import type { CloseApproach } from "@/lib/types/space";

const AsteroidScene = dynamic(() => import("@/components/space/AsteroidScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-white/10 bg-black/40 text-sm text-slate-500 sm:h-[480px]">
      3D シミュレーター読み込み中...
    </div>
  ),
});

export default function AsteroidSimulatorTab() {
  const [approaches, setApproaches] = useState<CloseApproach[]>([]);
  const [selected, setSelected] = useState<CloseApproach | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    fetch("/api/space/neo?limit=30")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const list = data.approaches as CloseApproach[];
        setApproaches(list);
        if (list[0]) setSelected(list[0]);
      })
      .catch(() => setError("小惑星データの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  function selectApproach(item: CloseApproach) {
    setSelected(item);
    setProgress(0);
    setPlaying(false);
  }

  function togglePlay() {
    if (progress >= 1) setProgress(0);
    setPlaying((p) => !p);
  }

  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <div className={spacePanelClass}>
          <h2 className="text-sm font-semibold text-white">地球接近小惑星</h2>
          <p className="mt-1 text-xs text-slate-400">
            NASA/JPL SBDB — 今後2年・0.2 AU 以内（接近日が近い順）
          </p>

          {loading && <p className="mt-4 text-sm text-slate-500">読み込み中...</p>}
          {error && (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <ul className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {approaches.map((item) => (
              <li key={`${item.designation}-${item.closeApproachDate}`}>
                <button
                  type="button"
                  onClick={() => selectApproach(item)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selected?.designation === item.designation &&
                    selected?.closeApproachDate === item.closeApproachDate
                      ? "border-orange-400/40 bg-orange-500/10"
                      : "border-white/5 bg-black/20 hover:bg-white/5"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{item.designation}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{item.closeApproachDate}</p>
                  <p className="mt-1 text-xs text-orange-200">
                    最接近: {item.distanceMinLd.toFixed(1)} LD (
                    {formatDistanceKm(item.distanceMinKm)})
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-3">
        {selected && (
          <>
            <div className={spacePanelClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">{selected.designation}</h2>
                  <p className="mt-1 text-xs text-slate-400">接近日: {selected.closeApproachDate}</p>
                </div>
                <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-orange-200/80">
                    最小接近距離
                  </p>
                  <p className="text-lg font-bold text-orange-100">
                    {selected.distanceMinLd.toFixed(2)} LD
                  </p>
                  <p className="text-xs text-orange-200/80">
                    {formatDistanceKm(selected.distanceMinKm)} · {selected.distanceMinAu.toFixed(4)} AU
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-slate-500">相対速度</p>
                  <p className="font-medium text-slate-200">{selected.velocityKmS.toFixed(1)} km/s</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-slate-500">絶対等級 H</p>
                  <p className="font-medium text-slate-200">{selected.absoluteMagnitude.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-slate-500">推定直径</p>
                  <p className="font-medium text-slate-200">
                    {selected.diameterKm ? `約 ${selected.diameterKm} km` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <AsteroidScene
              key={`${selected.designation}-${selected.closeApproachDate}`}
              approach={selected}
              progress={progress}
              playing={playing}
              onProgress={setProgress}
            />

            <div className={spacePanelClass}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-2 text-sm font-semibold text-white"
                >
                  {playing ? "⏸ 一時停止" : progress >= 1 ? "↺ 再生" : "▶ 接近アニメーション"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProgress(0);
                    setPlaying(false);
                  }}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:bg-white/5"
                >
                  リセット
                </button>
                <span className="text-xs text-slate-500">
                  {Math.round(progress * 100)}% — 選択した小惑星の軌道で接近をシミュレーション
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(progress * 100)}
                onChange={(e) => {
                  setPlaying(false);
                  setProgress(Number(e.target.value) / 100);
                }}
                className="mt-4 w-full accent-orange-500"
              />
              <p className="mt-2 text-[10px] text-slate-500">
                データ: JPL SBDB。軌道は接近距離・速度・サイズに基づく簡易モデル（小惑星ごとに軌道が変わります）。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
