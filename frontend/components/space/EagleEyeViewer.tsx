"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GROUND_CAMERAS,
  GROUND_PIN_COLORS,
  type EagleEyeFootprint,
  type EagleEyeSatelliteDef,
  type GroundCamera,
} from "@/lib/eagle-eye-data";
import {
  buildCameraFovPolygon,
  computeSatelliteLiveInfo,
  findNearestImagingSatelliteId,
  formatAltitude,
  formatSpeedKmS,
  getAltitudeFromTrack,
  getFootprintZoomBounds,
  getPositionFromTrack,
  resolveFootprintForSatellite,
  type EagleEyePhase,
  type EagleEyeTracksResponse,
  type SatelliteTrackDto,
  type SatelliteLiveInfo,
  type SortRoi,
} from "@/lib/eagle-eye-client";
import { IMAGING_ROI } from "@/lib/eagle-eye-data";

const CESIUM_VERSION = "1.144.0";
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export type EagleEyeViewerState = {
  phase: EagleEyePhase;
  selectedSatellite: EagleEyeSatelliteDef | null;
  selectedFootprint: EagleEyeFootprint | null;
  nearestSatelliteId: string | null;
  satelliteAltitude: string | null;
  orbitalSpeedKmS: number | null;
  activeCamera: GroundCamera | null;
  footprintImageUrl: string | null;
  liveStreamUrl: string | null;
  liveInfos: SatelliteLiveInfo[];
  satelliteCount: number;
  satellites: EagleEyeSatelliteDef[];
  sortPlaceLabel: string | null;
};

type EagleEyeViewerProps = {
  selectedSatelliteId?: string | null;
  selectNonce?: number;
  sortPlace?: SortRoi | null;
  onStateChange?: (state: EagleEyeViewerState) => void;
};

type CesiumModule = typeof import("cesium");

const NEAREST_COLOR = "#fbbf24";
const PAST_COLOR = "#64748b";
const FUTURE_COLOR = "#38bdf8";

let cesiumLoadPromise: Promise<CesiumModule> | null = null;

function loadCesium(): Promise<CesiumModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cesium requires browser"));
  }
  if ((window as unknown as { Cesium?: CesiumModule }).Cesium) {
    return Promise.resolve((window as unknown as { Cesium: CesiumModule }).Cesium);
  }
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE;

    if (!document.querySelector("link[data-cesium-widgets]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `${CESIUM_BASE}Widgets/widgets.css`;
      link.setAttribute("data-cesium-widgets", "true");
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = `${CESIUM_BASE}Cesium.js`;
    script.async = true;
    script.onload = () => {
      const Cesium = (window as unknown as { Cesium: CesiumModule }).Cesium;
      if (Cesium) resolve(Cesium);
      else reject(new Error("Cesium failed to load"));
    };
    script.onerror = () => reject(new Error("Cesium script load failed"));
    document.body.appendChild(script);
  });

  return cesiumLoadPromise;
}

function satColor(idx: number): string {
  const palette = ["#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf"];
  return palette[idx % palette.length];
}

function addMapImagery(viewer: import("cesium").Viewer, Cesium: CesiumModule, withLabels: boolean) {
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: ESRI_IMAGERY,
      credit: "Esri, Maxar",
    }),
  );
  if (withLabels) {
    const labels = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: ESRI_LABELS,
        credit: "Esri Labels",
      }),
    );
    labels.alpha = 0.92;
  }
}

export default function EagleEyeViewer({
  selectedSatelliteId = null,
  selectNonce = 0,
  sortPlace = null,
  onStateChange,
}: EagleEyeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const tracksRef = useRef<SatelliteTrackDto[]>([]);
  const satellitesRef = useRef<EagleEyeSatelliteDef[]>([]);
  const footprintRef = useRef<import("cesium").Entity | null>(null);
  const activeFootprintRef = useRef<EagleEyeFootprint | null>(null);
  const nearestIdRef = useRef<string | null>(null);
  const selectedSatRef = useRef<EagleEyeSatelliteDef | null>(null);
  const mapModeRef = useRef(false);
  const sortPlaceRef = useRef<SortRoi>(IMAGING_ROI);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  sortPlaceRef.current = sortPlace ?? IMAGING_ROI;

  useEffect(() => {
    sortPlaceRef.current = sortPlace ?? IMAGING_ROI;
  }, [sortPlace]);

  const [ready, setReady] = useState(false);
  const [isMapMode, setIsMapMode] = useState(false);
  const [mapSatellite, setMapSatellite] = useState<EagleEyeSatelliteDef | null>(null);
  const [hud, setHud] = useState({ speed: "—", nearest: "", count: 0, place: "東京" });

  const emitState = useCallback((patch: Partial<EagleEyeViewerState>) => {
    const viewer = viewerRef.current;
    const clockDate =
      viewer && cesiumRef.current
        ? cesiumRef.current.JulianDate.toDate(viewer.clock.currentTime)
        : new Date();
    const tracks = tracksRef.current;
    const roi = sortPlaceRef.current;
    const liveInfos = computeSatelliteLiveInfo(tracks, clockDate, roi);
    const nearestSatelliteId = findNearestImagingSatelliteId(tracks, clockDate, roi);
    nearestIdRef.current = nearestSatelliteId;

    const selected = selectedSatRef.current;
    const track = selected ? tracks.find((t) => t.satellite.id === selected.id) : null;
    const fp = activeFootprintRef.current;

    const base: EagleEyeViewerState = {
      phase: mapModeRef.current ? "map" : "orbit",
      selectedSatellite: selected,
      selectedFootprint: fp,
      nearestSatelliteId,
      satelliteAltitude: track ? getAltitudeFromTrack(track, clockDate) : null,
      orbitalSpeedKmS: track
        ? liveInfos.find((i) => i.id === track.satellite.id)?.speedKmS ?? null
        : liveInfos.find((i) => i.id === nearestSatelliteId)?.speedKmS ?? null,
      activeCamera: null,
      footprintImageUrl: fp?.imageUrl ?? selected?.mediaUrl ?? null,
      liveStreamUrl: selected?.liveStreamUrl ?? null,
      liveInfos,
      satelliteCount: satellitesRef.current.length,
      satellites: satellitesRef.current,
      sortPlaceLabel: roi.label ?? null,
    };

    const next = { ...base, ...patch };
    onStateChangeRef.current?.(next);
    return next;
  }, []);

  const updateSatelliteStyles = useCallback(
    (nearestId: string | null, selectedId: string | null) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      satellitesRef.current.forEach((sat, idx) => {
        const entity = viewer.entities.getById(sat.id);
        if (!entity?.point) return;

        const isNearest = sat.id === nearestId;
        const isSelected = sat.id === selectedId;
        const pixelSize = isSelected ? 14 : isNearest ? 12 : 6;
        entity.point.pixelSize = new Cesium.ConstantProperty(pixelSize);
        entity.point.color = new Cesium.ConstantProperty(
          Cesium.Color.fromCssColorString(
            isNearest || isSelected ? NEAREST_COLOR : satColor(idx),
          ),
        );
        entity.point.outlineWidth = new Cesium.ConstantProperty(isNearest ? 3 : 1);
        if (entity.label) {
          entity.label.show = new Cesium.ConstantProperty(isSelected || isNearest);
        }
      });
    },
    [],
  );

  const showMapCameras = useCallback((show: boolean) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      GROUND_CAMERAS.forEach((cam) => {
        const fovEntity = viewer.entities.getById(`cam-fov-${cam.id}`);
        const pinEntity = viewer.entities.getById(`cam-${cam.id}`);
        if (!pinEntity) return;

        pinEntity.show = show;
        if (fovEntity) fovEntity.show = show;
        if (pinEntity.label) {
          pinEntity.label.show = new Cesium.ConstantProperty(show);
        }
        if (pinEntity.point) {
          pinEntity.point.pixelSize = new Cesium.ConstantProperty(show ? 14 : 8);
        }
      });
    },
    [],
  );

  const flyToGroundCamera = useCallback(
    (cam: GroundCamera) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 650),
        orientation: {
          heading: Cesium.Math.toRadians(cam.headingDeg),
          pitch: Cesium.Math.toRadians(-50),
          roll: 0,
        },
        duration: 2.8,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      });
    },
    [],
  );

  const enterMapMode = useCallback(
    (sat: EagleEyeSatelliteDef) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      selectedSatRef.current = sat;
      mapModeRef.current = true;
      setIsMapMode(true);
      setMapSatellite(sat);

      const track = tracksRef.current.find((t) => t.satellite.id === sat.id);
      const clockDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
      const pos = track
        ? getPositionFromTrack(track, clockDate)
        : { lat: 35.68, lon: 139.76, altKm: 400 };
      const fp = resolveFootprintForSatellite(sat, pos.lat, pos.lon, pos.altKm);
      activeFootprintRef.current = fp;

      if (footprintRef.current) viewer.entities.remove(footprintRef.current);

      const zoomBounds = getFootprintZoomBounds(fp);

      // ① 宇宙から衛星付近へ（3D）
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          pos.lon,
          pos.lat,
          Math.max(pos.altKm * 1000 + 800_000, 600_000),
        ),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-65),
          roll: 0,
        },
        duration: 1.8,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        complete: () => {
          if (!viewer || viewer.isDestroyed()) return;
          // ② 2D 地図へモーフ + 地名レイヤー
          addMapImagery(viewer, Cesium, true);
          viewer.scene.morphTo2D(1.6);

          setTimeout(() => {
            if (!viewer || viewer.isDestroyed()) return;

            footprintRef.current = viewer.entities.add({
              id: `${sat.id}-footprint`,
              name: fp.label,
              rectangle: {
                coordinates: Cesium.Rectangle.fromDegrees(fp.west, fp.south, fp.east, fp.north),
                material: Cesium.Color.fromCssColorString(NEAREST_COLOR).withAlpha(0.12),
                height: 0,
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString(NEAREST_COLOR).withAlpha(0.9),
                outlineWidth: 2,
              },
            });

            showMapCameras(true);

            // ③ 地上スキャンエリアへ降下
            viewer.camera.flyTo({
              destination: Cesium.Rectangle.fromDegrees(
                zoomBounds.west,
                zoomBounds.south,
                zoomBounds.east,
                zoomBounds.north,
              ),
              duration: 2.4,
              easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
            });
          }, 700);
        },
      });

      updateSatelliteStyles(nearestIdRef.current, sat.id);
      emitState({
        phase: "map",
        footprintImageUrl: fp.imageUrl,
        liveStreamUrl: sat.liveStreamUrl ?? null,
        activeCamera: null,
      });
    },
    [emitState, showMapCameras, updateSatelliteStyles],
  );

  const exitMapMode = useCallback(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    mapModeRef.current = false;
    setIsMapMode(false);
    setMapSatellite(null);
    selectedSatRef.current = null;
    activeFootprintRef.current = null;

    if (footprintRef.current) {
      viewer.entities.remove(footprintRef.current);
      footprintRef.current = null;
    }

    addMapImagery(viewer, Cesium, false);
    showMapCameras(false);
    viewer.scene.morphTo3D(1.5);
    setTimeout(() => {
      viewer!.camera.flyHome(2);
    }, 300);

    updateSatelliteStyles(nearestIdRef.current, null);
    emitState({
      phase: "orbit",
      selectedSatellite: null,
      selectedFootprint: null,
      footprintImageUrl: null,
      liveStreamUrl: null,
      activeCamera: null,
    });
  }, [emitState, showMapCameras, updateSatelliteStyles]);

  useEffect(() => {
    if (!selectedSatelliteId || !ready) return;
    const sat = satellitesRef.current.find((s) => s.id === selectedSatelliteId);
    if (sat) enterMapMode(sat);
  }, [selectedSatelliteId, selectNonce, ready, enterMapMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let viewer: import("cesium").Viewer | null = null;
    let tickHandler: (() => void) | null = null;

    loadCesium()
      .then(async (Cesium) => {
        if (destroyed || !containerRef.current) return;
        cesiumRef.current = Cesium;

        const tracksRes = await fetch("/api/space/eagle-eye/tracks");
        if (!tracksRes.ok) throw new Error("Failed to load satellite tracks");
        const tracksData = (await tracksRes.json()) as EagleEyeTracksResponse;
        tracksRef.current = tracksData.tracks;
        satellitesRef.current = tracksData.satellites ?? tracksData.tracks.map((t) => t.satellite);

        const now = new Date();
        const start = new Date(now.getTime() - 45 * 60_000);
        const stop = new Date(now.getTime() + 45 * 60_000);

        viewer = new Cesium.Viewer(containerRef.current, {
          animation: true,
          timeline: true,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: true,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          infoBox: false,
          selectionIndicator: true,
        });

        addMapImagery(viewer, Cesium, false);

        viewer.clock.startTime = Cesium.JulianDate.fromDate(start);
        viewer.clock.stopTime = Cesium.JulianDate.fromDate(stop);
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(now);
        viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        viewer.clock.multiplier = 1;
        viewer.clock.shouldAnimate = true;

        viewer.timeline?.zoomTo(
          Cesium.JulianDate.fromDate(start),
          Cesium.JulianDate.fromDate(stop),
        );

        tracksData.tracks.forEach((track, idx) => {
          const color = satColor(idx);
          const sat = track.satellite;
          const nowIdx = track.nowIndex;

          const pastPositions = track.positions.slice(0, nowIdx + 1);
          const futurePositions = track.positions.slice(nowIdx);

          if (pastPositions.length >= 2) {
            viewer!.entities.add({
              id: `${sat.id}-path-past`,
              polyline: {
                positions: pastPositions.map((p) =>
                  Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000),
                ),
                width: 1.5,
                material: Cesium.Color.fromCssColorString(PAST_COLOR).withAlpha(0.45),
              },
            });
          }

          if (futurePositions.length >= 2) {
            viewer!.entities.add({
              id: `${sat.id}-path-future`,
              polyline: {
                positions: futurePositions.map((p) =>
                  Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000),
                ),
                width: 2,
                material: new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.08,
                  color: Cesium.Color.fromCssColorString(FUTURE_COLOR).withAlpha(0.65),
                }),
              },
            });
          }

          const positionProperty = new Cesium.SampledPositionProperty();
          positionProperty.setInterpolationOptions({
            interpolationDegree: 2,
            interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
          });

          track.positions.forEach((p) => {
            positionProperty.addSample(
              Cesium.JulianDate.fromDate(new Date(p.time)),
              Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000),
            );
          });

          viewer!.entities.add({
            id: sat.id,
            name: sat.name,
            position: positionProperty,
            point: {
              pixelSize: 6,
              color: Cesium.Color.fromCssColorString(color),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
            },
            label: {
              text: sat.name,
              font: "10px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              show: false,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
            },
          });
        });

        GROUND_CAMERAS.forEach((cam) => {
          const pinColor = GROUND_PIN_COLORS[cam.mediaType];
          const icon = cam.mediaType === "video" ? "🎥" : "🖼";
          const fovPoints = buildCameraFovPolygon(
            cam.lat,
            cam.lon,
            cam.headingDeg,
            cam.fovDeg,
            cam.rangeM,
          );

          viewer!.entities.add({
            id: `cam-fov-${cam.id}`,
            show: false,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(
                fovPoints.flatMap((p) => [p.lon, p.lat]),
              ),
              material: Cesium.Color.fromCssColorString(pinColor).withAlpha(0.22),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(pinColor).withAlpha(0.75),
              height: 0,
            },
          });

          viewer!.entities.add({
            id: `cam-${cam.id}`,
            name: cam.name,
            position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 50),
            show: false,
            point: {
              pixelSize: 12,
              color: Cesium.Color.fromCssColorString(pinColor),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
            label: {
              text: `${icon} ${cam.name}`,
              font: "10px sans-serif",
              fillColor: Cesium.Color.fromCssColorString(pinColor),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 12),
              show: false,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500_000),
            },
          });
        });

        tickHandler = () => {
          if (!viewer || viewer.isDestroyed()) return;
          const clockDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
          const roi = sortPlaceRef.current;
          const nearestId = findNearestImagingSatelliteId(tracksRef.current, clockDate, roi);
          nearestIdRef.current = nearestId;

          const liveInfos = computeSatelliteLiveInfo(tracksRef.current, clockDate, roi);
          const nearestInfo = liveInfos.find((i) => i.id === nearestId);
          const nearestSat = satellitesRef.current.find((s) => s.id === nearestId);

          setHud({
            speed: nearestInfo ? formatSpeedKmS(nearestInfo.speedKmS) : "—",
            nearest: nearestSat?.name ?? "—",
            count: satellitesRef.current.length,
            place: roi.label ?? "—",
          });

          updateSatelliteStyles(nearestId, selectedSatRef.current?.id ?? null);

          if (!mapModeRef.current) emitState({});
        };
        viewer.clock.onTick.addEventListener(tickHandler);

        viewer.selectedEntityChanged.addEventListener((entity) => {
          if (!entity?.id || typeof entity.id !== "string") return;
          if (entity.id.startsWith("cam-fov-")) return;

          if (entity.id.startsWith("cam-")) {
            const camId = entity.id.slice("cam-".length);
            const cam = GROUND_CAMERAS.find((c) => c.id === camId);
            if (cam) {
              flyToGroundCamera(cam);
              emitState({ phase: "live", activeCamera: cam });
            }
            return;
          }

          const sat = satellitesRef.current.find((s) => s.id === entity.id);
          if (sat) enterMapMode(sat);
        });

        viewerRef.current = viewer;
        setReady(true);
        tickHandler();
      })
      .catch((err) => {
        console.error("[EagleEye] Cesium load failed:", err);
      });

    return () => {
      destroyed = true;
      if (viewer && tickHandler && !viewer.isDestroyed()) {
        viewer.clock.onTick.removeEventListener(tickHandler);
      }
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, [emitState, enterMapMode, flyToGroundCamera, updateSatelliteStyles]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70">
          <p className="text-sm text-slate-300">鷹の目 — 3D地球を読み込み中...</p>
        </div>
      )}
      {ready && (
        <div className="pointer-events-none absolute left-3 top-3 space-y-1.5">
          <div className="rounded-lg border border-amber-400/30 bg-black/70 px-3 py-2 text-xs">
            <p className="text-amber-300/80">リアルタイム軌道 · {hud.count}機</p>
            <p className="mt-0.5 font-mono text-sm text-white">{hud.speed}</p>
          </div>
          <div className="rounded-lg border border-cyan-400/20 bg-black/60 px-3 py-1.5 text-[10px] text-slate-300">
            最接近（{hud.place}）:{" "}
            <span className="text-amber-300">{hud.nearest}</span>
          </div>
        </div>
      )}
      {ready && isMapMode && (
        <button
          type="button"
          onClick={exitMapMode}
          className="absolute right-3 top-3 z-10 rounded-lg border border-cyan-400/40 bg-black/80 px-3 py-2 text-xs font-semibold text-cyan-200 shadow-lg transition hover:bg-cyan-500/20"
        >
          🌍 地球表示に戻る
        </button>
      )}
      {ready && !isMapMode && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-slate-300">
          🟡=撮影可能 · 衛星クリック→上空写真クローズアップ
        </div>
      )}
      {ready && isMapMode && mapSatellite && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-lg bg-black/70 px-3 py-2 text-xs text-slate-300">
          <p className="text-amber-200/90">スキャン画像エリア</p>
          <p className="mt-0.5">{activeFootprintRef.current?.label ?? mapSatellite.name}</p>
          <p className="mt-1 text-[10px] text-slate-400">🎥=映像ピン · 🖼=画像ピン · クリックで地上へ降下</p>
        </div>
      )}
    </div>
  );
}
