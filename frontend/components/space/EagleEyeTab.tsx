"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { spacePanelClass } from "@/lib/space-utils";
import { EAGLE_EYE_SATELLITES } from "@/lib/eagle-eye-data";
import { sortSatellitesByImaging, type EagleEyePhase } from "@/lib/eagle-eye-client";
import type { EagleEyeViewerState } from "@/components/space/EagleEyeViewer";

const EagleEyeViewer = dynamic(() => import("@/components/space/EagleEyeViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-xl border border-white/10 bg-black/60">
      <p className="text-sm text-slate-400">鷹の目 — 3D地球を準備中...</p>
    </div>
  ),
});

const phaseLabels: Record<EagleEyePhase, string> = {
  orbit: "軌道監視（リアルタイム）",
  map: "スキャン画像エリアへクローズアップ",
  live: "地上カメラ接続",
};

export default function EagleEyeTab() {
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null);
  const [selectNonce, setSelectNonce] = useState(0);
  const [state, setState] = useState<EagleEyeViewerState>({
    phase: "orbit",
    selectedSatellite: null,
    nearestSatelliteId: null,
    satelliteAltitude: null,
    orbitalSpeedKmS: null,
    activeCamera: null,
    footprintImageUrl: null,
    liveInfos: [],
  });

  const handleStateChange = useCallback((next: EagleEyeViewerState) => {
    setState(next);
  }, []);

  const satelliteList = useMemo(() => {
    const sorted = sortSatellitesByImaging(
      EAGLE_EYE_SATELLITES,
      state.nearestSatelliteId,
    );

    return sorted.map((sat) => {
      const live = state.liveInfos.find((i) => i.id === sat.id);
      return {
        sat,
        isNearest: sat.id === state.nearestSatelliteId,
        isSelected: sat.id === state.selectedSatellite?.id,
        speed: live ? `${live.speedKmS.toFixed(2)} km/s` : "—",
        alt: live ? `${Math.round(live.altKm)} km` : "—",
      };
    });
  }, [state.liveInfos, state.nearestSatelliteId, state.selectedSatellite]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className={`${spacePanelClass} overflow-hidden p-0`}>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80">
            Eagle Eye / 鷹の目
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            衛星俯瞰 → 地図クローズアップ → 地上カメラ
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            リアルタイム軌道 · 撮影可能衛星を自動ハイライト · スキャン画像エリアへ2Dズーム
          </p>
        </div>
        <div className="h-[560px] w-full">
          <EagleEyeViewer
            selectedSatelliteId={selectedSatelliteId}
            selectNonce={selectNonce}
            onStateChange={handleStateChange}
          />
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            ステータス
          </p>
          <p className="mt-2 text-sm font-medium text-white">{phaseLabels[state.phase]}</p>
          {state.orbitalSpeedKmS != null && (
            <p className="mt-1 font-mono text-xs text-cyan-300">
              軌道速度: {state.orbitalSpeedKmS.toFixed(2)} km/s
            </p>
          )}
        </div>

        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            衛星スキャン画像
          </p>
          {state.footprintImageUrl && state.selectedSatellite ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-white">{state.selectedSatellite.name}</p>
              <p className="text-[10px] text-slate-500">{state.selectedSatellite.footprint.label}</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-amber-400/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.footprintImageUrl}
                  alt={state.selectedSatellite.footprint.label}
                  className="aspect-video w-full object-cover"
                />
              </div>
              {state.satelliteAltitude && (
                <p className="mt-1 text-xs text-slate-400">高度: {state.satelliteAltitude}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              衛星一覧から選択すると、スキャン画像がここに表示されます
            </p>
          )}
        </div>

        <div className={`${spacePanelClass} flex-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            地上カメラ / 映像
          </p>
          {state.activeCamera ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-white">{state.activeCamera.name}</p>
              <p className="text-xs text-orange-300">{state.activeCamera.type}</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-orange-400/30 bg-black">
                <iframe
                  title={state.activeCamera.name}
                  src={state.activeCamera.embedUrl}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {state.phase === "map" || state.phase === "live"
                ? "スキャン画像エリア内の📷ピンをクリックすると映像が表示されます"
                : "衛星を選択すると、③のスキャン画像エリアへ2D地図がズームします"}
            </p>
          )}
        </div>

        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            衛星一覧
          </p>
          <ul className="mt-2 space-y-2">
            {satelliteList.map(({ sat, isNearest, isSelected, speed, alt }) => (
              <li key={sat.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSatelliteId(sat.id);
                    setSelectNonce((n) => n + 1);
                  }}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                    isSelected
                      ? "border-cyan-400/50 bg-cyan-500/15"
                      : isNearest
                        ? "border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/15"
                        : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        isNearest ? "bg-amber-400 ring-2 ring-amber-400/40" : "bg-sky-400"
                      }`}
                    />
                    <span className="font-medium text-white">{sat.name}</span>
                    {isNearest && (
                      <span className="ml-auto rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-200">
                        撮影可能
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 block pl-[18px] text-[10px] text-slate-500">
                    {sat.footprint.label}
                  </span>
                  <span className="mt-0.5 block pl-[18px] font-mono text-[9px] text-slate-600">
                    {speed} · {alt}
                  </span>
                </button>
              </li>
            ))}
            {!satelliteList.length && (
              <li className="text-xs text-slate-500">軌道データ読み込み中…</li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
