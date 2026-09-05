"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { spacePanelClass } from "@/lib/space-utils";
import { resolvePlaceQuery, DEFAULT_SORT_PLACE } from "@/lib/eagle-eye-places";
import {
  GROUND_CAMERAS,
  GROUND_CAMERA_DIRECTORIES,
} from "@/lib/eagle-eye-data";
import {
  sortSatellitesByImaging,
  type EagleEyePhase,
  type SortRoi,
} from "@/lib/eagle-eye-client";
import type { EagleEyeViewerState } from "@/components/space/EagleEyeViewer";

const EagleEyeViewer = dynamic(() => import("@/components/space/EagleEyeViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-xl border border-white/10 bg-black/60">
      <p className="text-sm text-slate-400">鷹の目 — 3D地球を準備中...</p>
    </div>
  ),
});

const PHASE_STEPS: {
  id: EagleEyePhase;
  label: string;
  hint: string;
}[] = [
  { id: "orbit", label: "衛星俯瞰", hint: "軌道監視" },
  { id: "map", label: "上空写真", hint: "衛星スキャン画像" },
  { id: "live", label: "地上カメラ", hint: "河川・道路・公開映像" },
];

export default function EagleEyeTab() {
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null);
  const [selectNonce, setSelectNonce] = useState(0);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [cameraSelectNonce, setCameraSelectNonce] = useState(0);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [sortPlace, setSortPlace] = useState<SortRoi>(DEFAULT_SORT_PLACE);
  const [phaseRequest, setPhaseRequest] = useState<{
    phase: EagleEyePhase;
    nonce: number;
  } | null>(null);
  const [state, setState] = useState<EagleEyeViewerState>({
    phase: "orbit",
    selectedSatellite: null,
    selectedFootprint: null,
    nearestSatelliteId: null,
    satelliteAltitude: null,
    orbitalSpeedKmS: null,
    activeCamera: null,
    footprintImageUrl: null,
    liveStreamUrl: null,
    liveInfos: [],
    satelliteCount: 0,
    satellites: [],
    groundCameras: GROUND_CAMERAS,
    sortPlaceLabel: DEFAULT_SORT_PLACE.label,
  });

  const [pendingNearestSelect, setPendingNearestSelect] = useState(false);

  const handleStateChange = useCallback((next: EagleEyeViewerState) => {
    setState(next);
  }, []);

  function onSearchClick() {
    const resolved = resolvePlaceQuery(placeQuery);
    if (!resolved) {
      setPlaceError("地名が見つかりません（例: 東京、大阪、35.68,139.76）");
      return;
    }
    setPlaceError(null);
    setPendingNearestSelect(true);
    setSortPlace({ ...resolved });
  }

  useEffect(() => {
    if (!pendingNearestSelect || !state.nearestSatelliteId) return;
    setPendingNearestSelect(false);
    setSelectedSatelliteId(state.nearestSatelliteId);
    setSelectNonce((n) => n + 1);
    setPhaseRequest({ phase: "map", nonce: Date.now() });
  }, [pendingNearestSelect, state.nearestSatelliteId]);

  const displaySat = state.selectedSatellite;
  const nearestSat = state.satellites.find((s) => s.id === state.nearestSatelliteId);
  const nearestLive = state.liveInfos.find((i) => i.id === state.nearestSatelliteId);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className={`${spacePanelClass} overflow-hidden p-0`}>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80">
            Eagle Eye / 鷹の目
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">視点モード</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PHASE_STEPS.map((step, index) => {
              const active = state.phase === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() =>
                    setPhaseRequest({ phase: step.id, nonce: Date.now() })
                  }
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-50"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <p className="text-[10px] text-slate-500">
                    {index + 1}. {step.hint}
                  </p>
                  <p className="text-sm font-semibold">
                    {step.label}
                    {step.id === "map" ? (
                      <span className="ml-1 text-[10px] font-normal text-amber-200">
                        （上空写真）
                      </span>
                    ) : null}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {state.satelliteCount || "—"}機 · 地上カメラ {GROUND_CAMERAS.length}地点 · 地球画像
          </p>
        </div>
        <div className="h-[560px] w-full">
          <EagleEyeViewer
            selectedSatelliteId={selectedSatelliteId}
            selectNonce={selectNonce}
            selectedCameraId={selectedCameraId}
            cameraSelectNonce={cameraSelectNonce}
            sortPlace={sortPlace}
            phaseRequest={phaseRequest}
            onStateChange={handleStateChange}
          />
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            地名で衛星ソート
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearchClick()}
              placeholder="例: 東京、大阪、渋谷"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={onSearchClick}
              className="shrink-0 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25"
            >
              検索
            </button>
          </div>
          {placeError && <p className="mt-1 text-[10px] text-rose-300">{placeError}</p>}
          <p className="mt-1 text-[10px] text-slate-500">
            基準: <span className="text-cyan-300">{state.sortPlaceLabel ?? sortPlace.label}</span>
            {" · "}近い順に一覧表示
          </p>
          {nearestSat && nearestLive && (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
              <p className="text-[10px] text-amber-100/80">最寄り衛星</p>
              <p className="text-sm font-semibold text-white">{nearestSat.name}</p>
              <p className="mt-1 font-mono text-[10px] text-amber-50/90">
                距離 {Math.round(nearestLive.footprintDistKm)} km · 高度{" "}
                {Math.round(nearestLive.altKm)} km · {nearestLive.speedKmS.toFixed(2)} km/s
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedSatelliteId(nearestSat.id);
                  setSelectNonce((n) => n + 1);
                }}
                className="mt-2 text-[10px] text-amber-100 underline-offset-2 hover:underline"
              >
                この衛星を開く
              </button>
            </div>
          )}
        </div>

        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            ステータス
          </p>
          <p className="mt-2 text-sm font-medium text-white">
            {PHASE_STEPS.find((s) => s.id === state.phase)?.label ?? state.phase}
            {state.phase === "map" ? "（上空写真）" : ""}
          </p>
          {state.orbitalSpeedKmS != null && (
            <p className="mt-1 font-mono text-xs text-cyan-300">
              軌道速度: {state.orbitalSpeedKmS.toFixed(2)} km/s
            </p>
          )}
        </div>

        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            衛星情報 / 写真
          </p>
          {displaySat ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-white">{displaySat.name}</p>
              {(displaySat.country || displaySat.category) && (
                <p className="text-[10px] text-indigo-300/80">
                  {displaySat.country
                    ? `${displaySat.country}${displaySat.countryCode ? `（${displaySat.countryCode}）` : ""}`
                    : ""}
                  {displaySat.country && displaySat.category ? " · " : ""}
                  {displaySat.category ?? ""}
                </p>
              )}
              {displaySat.info && (
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{displaySat.info}</p>
              )}
              {displaySat.appearanceUrl && (
                <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
                  <p className="bg-white/5 px-2 py-1 text-[10px] text-slate-400">衛星の外観</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displaySat.appearanceUrl}
                    alt={`${displaySat.name} appearance`}
                    className="aspect-video w-full object-cover"
                  />
                </div>
              )}
              {state.liveStreamUrl && (
                <div className="mt-2 overflow-hidden rounded-lg border border-red-400/40 bg-black">
                  <p className="bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200">
                    ● LIVE 公開映像
                  </p>
                  <iframe
                    title={`${displaySat.name} ライブ`}
                    src={state.liveStreamUrl}
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
              {state.footprintImageUrl && (
                <div className="mt-2 overflow-hidden rounded-lg border border-amber-400/30">
                  <p className="bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                    上空写真 / スキャン画像
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={state.footprintImageUrl}
                    alt={displaySat.name}
                    className="aspect-video w-full object-cover"
                  />
                </div>
              )}
              {state.satelliteAltitude && (
                <p className="mt-1 text-xs text-slate-400">高度: {state.satelliteAltitude}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              衛星を選ぶと外観写真・上空写真・ライブ映像を表示します
            </p>
          )}
        </div>

        <div className={`${spacePanelClass} flex-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            地上カメラ / 映像（{GROUND_CAMERAS.length}）
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            CCTVアイコン＝地上カメラ / 菱形＝衛星。公開ソースをピン留め。
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GROUND_CAMERA_DIRECTORIES.map((dir) => (
              <a
                key={dir.url}
                href={dir.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-cyan-200/90 hover:bg-white/10"
                title={dir.note}
              >
                {dir.label}
              </a>
            ))}
          </div>
          {state.activeCamera ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-white">{state.activeCamera.name}</p>
              <p className="text-xs text-orange-300">
                {state.activeCamera.type} · {state.activeCamera.country}
                {state.activeCamera.region ? ` · ${state.activeCamera.region}` : ""}{" "}
                · {state.activeCamera.mediaType === "video" ? "映像" : "画像"}
              </p>
              {state.activeCamera.sourceUrl && (
                <a
                  href={state.activeCamera.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[10px] text-sky-300 underline-offset-2 hover:underline"
                >
                  出典: {state.activeCamera.sourceLabel ?? "公開ライブ"}
                </a>
              )}
              <div className="mt-2 overflow-hidden rounded-lg border border-orange-400/30 bg-black">
                {state.activeCamera.mediaType === "video" ? (
                  <iframe
                    title={state.activeCamera.name}
                    src={state.activeCamera.mediaUrl}
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={state.activeCamera.mediaUrl}
                    alt={state.activeCamera.name}
                    className="aspect-video w-full object-cover"
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              一覧または地球上のカメラアイコンを選択
            </p>
          )}
          <ul className="mt-3 max-h-44 space-y-1.5 overflow-y-auto">
            {GROUND_CAMERAS.map((cam) => {
              const active = state.activeCamera?.id === cam.id;
              return (
                <li key={cam.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCameraId(cam.id);
                      setCameraSelectNonce((n) => n + 1);
                      setPhaseRequest({ phase: "live", nonce: Date.now() });
                    }}
                    className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
                      active
                        ? "border-orange-400/50 bg-orange-500/15"
                        : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <span className="block truncate font-medium text-white">{cam.name}</span>
                    <span className="text-[9px] text-slate-500">
                      {cam.country}
                      {cam.region ? ` · ${cam.region}` : ""} · {cam.type}
                      {cam.mediaType === "video" ? " · 映像" : " · 画像"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={spacePanelClass}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            衛星一覧（近い順） ({state.satelliteCount || "…"})
          </p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {state.satellites.length > 0
              ? sortSatellitesByImaging(
                  state.satellites,
                  state.liveInfos,
                  state.nearestSatelliteId,
                ).map((sat) => {
                  const live = state.liveInfos.find((i) => i.id === sat.id);
                  const isNearest = sat.id === state.nearestSatelliteId;
                  const isSelected = sat.id === state.selectedSatellite?.id;

                  return (
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
                            className={`h-2.5 w-2.5 shrink-0 rotate-45 ${
                              isNearest ? "bg-amber-400 ring-2 ring-amber-400/40" : "bg-sky-400"
                            }`}
                          />
                          <span className="truncate font-medium text-white">{sat.name}</span>
                          {isNearest && (
                            <span className="ml-auto shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-200">
                              最寄り
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block pl-[18px] text-[9px] text-indigo-200/80">
                          {sat.country ?? "国不明"}
                          {sat.countryCode ? `（${sat.countryCode}）` : ""}
                        </span>
                        <span className="mt-0.5 block pl-[18px] font-mono text-[9px] text-slate-600">
                          {live
                            ? `${Math.round(live.footprintDistKm)} km · ${Math.round(live.altKm)} km · ${live.speedKmS.toFixed(2)} km/s`
                            : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })
              : (
                <li className="text-xs text-slate-500">軌道データ読み込み中…</li>
              )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
