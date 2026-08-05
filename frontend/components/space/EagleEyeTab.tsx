"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { spacePanelClass } from "@/lib/space-utils";
import { EAGLE_EYE_SATELLITES, GROUND_CAMERAS } from "@/lib/eagle-eye-data";
import type { EagleEyeViewerState } from "@/components/space/EagleEyeViewer";

const EagleEyeViewer = dynamic(() => import("@/components/space/EagleEyeViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-xl border border-white/10 bg-black/60">
      <p className="text-sm text-slate-400">鷹の目 — 3D地球を準備中...</p>
    </div>
  ),
});

const phaseLabels: Record<EagleEyeViewerState["phase"], string> = {
  orbit: "軌道監視",
  scanning: "衛星スキャン",
  zooming: "ターゲットへ接近中…",
  live: "地上カメラ接続",
};

export default function EagleEyeTab() {
  const [state, setState] = useState<EagleEyeViewerState>({
    selectedSatellite: null,
    satelliteAltitude: null,
    activeCamera: null,
    clickLat: null,
    clickLon: null,
    phase: "orbit",
  });

  const handleStateChange = useCallback((next: EagleEyeViewerState) => {
    setState(next);
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className={`${spacePanelClass} overflow-hidden p-0`}>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80">
            Eagle Eye / 鷹の目
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            衛星俯瞰 → 地上カメラ クローズアップ
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {EAGLE_EYE_SATELLITES.length} 機の衛星軌道（±45分）· {GROUND_CAMERAS.length}{" "}
            地点の地上カメラ · Cesium + satellite.js
          </p>
        </div>
        <div className="h-[520px] w-full">
          <EagleEyeViewer onStateChange={handleStateChange} />
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            ステータス
          </p>
          <p className="mt-2 text-sm font-medium text-white">{phaseLabels[state.phase]}</p>

          {state.selectedSatellite && (
            <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
              <p className="text-xs text-cyan-200">選択衛星</p>
              <p className="text-sm font-semibold text-white">{state.selectedSatellite.name}</p>
              {state.satelliteAltitude && (
                <p className="mt-1 text-xs text-slate-300">高度: {state.satelliteAltitude}</p>
              )}
            </div>
          )}

          {state.clickLat != null && state.clickLon != null && (
            <div className="mt-2 text-xs text-slate-400">
              ターゲット: {state.clickLat.toFixed(4)}°N, {state.clickLon.toFixed(4)}°E
            </div>
          )}
        </div>

        <div className={`${spacePanelClass} flex-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            地上ライブカメラ
          </p>

          {state.activeCamera ? (
            <div className="mt-3 opacity-100 transition-opacity duration-500">
              <p className="text-sm font-semibold text-white">{state.activeCamera.name}</p>
              <p className="mt-0.5 text-xs text-orange-300">{state.activeCamera.type}</p>
              <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black">
                <iframe
                  title={state.activeCamera.name}
                  src={state.activeCamera.embedUrl}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                最寄りカメラを自動選択 · YouTube ライブ映像
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-400">
                1. 衛星ピンをクリックしてスキャンエリアを表示
              </p>
              <p className="text-xs text-slate-400">
                2. 衛星画像（オーバーレイ）または地図上をクリック
              </p>
              <p className="text-xs text-slate-400">
                3. 最寄りの地上カメラへ自動ズーム → ライブ映像が表示
              </p>
              <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                {GROUND_CAMERAS.map((cam) => (
                  <li key={cam.id} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="text-orange-400">📷</span>
                    <span>
                      {cam.name}
                      <span className="ml-1 text-[10px] text-slate-600">({cam.type})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            衛星一覧
          </p>
          <ul className="mt-2 space-y-2">
            {EAGLE_EYE_SATELLITES.map((sat) => (
              <li
                key={sat.id}
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  state.selectedSatellite?.id === sat.id
                    ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                    : "border-white/10 text-slate-400"
                }`}
              >
                <span className="font-medium text-white">{sat.name}</span>
                <span className="mt-0.5 block text-[10px]">{sat.footprint.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
