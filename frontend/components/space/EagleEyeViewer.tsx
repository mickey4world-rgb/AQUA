"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EAGLE_EYE_SATELLITES,
  GROUND_CAMERAS,
  type EagleEyeSatelliteDef,
  type GroundCamera,
} from "@/lib/eagle-eye-data";
import {
  computeSatelliteLiveInfo,
  findCamerasNearFootprint,
  findNearestImagingSatelliteId,
  formatAltitude,
  formatSpeedKmS,
  getAltitudeFromTrack,
  getFootprintZoomBounds,
  type EagleEyePhase,
  type EagleEyeTracksResponse,
  type SatelliteLiveInfo,
  type SatelliteTrackDto,
} from "@/lib/eagle-eye-client";

const CESIUM_VERSION = "1.144.0";
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;

export type EagleEyeViewerState = {
  phase: EagleEyePhase;
  selectedSatellite: EagleEyeSatelliteDef | null;
  nearestSatelliteId: string | null;
  satelliteAltitude: string | null;
  orbitalSpeedKmS: number | null;
  activeCamera: GroundCamera | null;
  footprintImageUrl: string | null;
  liveInfos: SatelliteLiveInfo[];
};

type EagleEyeViewerProps = {
  selectedSatelliteId?: string | null;
  selectNonce?: number;
  onStateChange?: (state: EagleEyeViewerState) => void;
};

type CesiumModule = typeof import("cesium");

const SAT_COLORS = ["#60a5fa", "#34d399", "#f472b6"] as const;
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

    if (!document.querySelector('link[data-cesium-widgets]')) {
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

export default function EagleEyeViewer({
  selectedSatelliteId = null,
  selectNonce = 0,
  onStateChange,
}: EagleEyeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const tracksRef = useRef<SatelliteTrackDto[]>([]);
  const footprintRef = useRef<import("cesium").Entity | null>(null);
  const nearestIdRef = useRef<string | null>(null);
  const selectedSatRef = useRef<EagleEyeSatelliteDef | null>(null);
  const mapModeRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const [ready, setReady] = useState(false);
  const [isMapMode, setIsMapMode] = useState(false);
  const [mapSatellite, setMapSatellite] = useState<EagleEyeSatelliteDef | null>(null);
  const [hud, setHud] = useState({ speed: "—", nearest: "" });

  const emitState = useCallback((patch: Partial<EagleEyeViewerState>) => {
    const viewer = viewerRef.current;
    const clockDate = viewer && cesiumRef.current
      ? cesiumRef.current.JulianDate.toDate(viewer.clock.currentTime)
      : new Date();
    const tracks = tracksRef.current;
    const liveInfos = computeSatelliteLiveInfo(tracks, clockDate);
    const nearestSatelliteId = findNearestImagingSatelliteId(tracks, clockDate);
    nearestIdRef.current = nearestSatelliteId;

    const selected = selectedSatRef.current;
    const track = selected
      ? tracks.find((t) => t.satellite.id === selected.id)
      : null;

    const base: EagleEyeViewerState = {
      phase: mapModeRef.current ? "map" : "orbit",
      selectedSatellite: selected,
      nearestSatelliteId,
      satelliteAltitude: track ? getAltitudeFromTrack(track, clockDate) : null,
      orbitalSpeedKmS: track
        ? liveInfos.find((i) => i.id === track.satellite.id)?.speedKmS ?? null
        : liveInfos.find((i) => i.id === nearestSatelliteId)?.speedKmS ?? null,
      activeCamera: null,
      footprintImageUrl: selected?.footprint.imageUrl ?? null,
      liveInfos,
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

      EAGLE_EYE_SATELLITES.forEach((sat, idx) => {
        const entity = viewer.entities.getById(sat.id);
        if (!entity?.point) return;

        const isNearest = sat.id === nearestId;
        const isSelected = sat.id === selectedId;
        const baseColor = SAT_COLORS[idx % SAT_COLORS.length];

        const pixelSize = isSelected ? 18 : isNearest ? 16 : 10;
        entity.point.pixelSize = new Cesium.ConstantProperty(pixelSize);
        entity.point.color = new Cesium.ConstantProperty(
          Cesium.Color.fromCssColorString(isNearest || isSelected ? NEAREST_COLOR : baseColor),
        );
        entity.point.outlineWidth = new Cesium.ConstantProperty(isNearest ? 3 : 2);
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

      if (footprintRef.current) {
        viewer.entities.remove(footprintRef.current);
      }

      const fp = sat.footprint;
      const zoomBounds = getFootprintZoomBounds(sat);

      footprintRef.current = viewer.entities.add({
        id: `${sat.id}-footprint`,
        name: fp.label,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(fp.west, fp.south, fp.east, fp.north),
          material: new Cesium.ImageMaterialProperty({ image: fp.imageUrl, transparent: true }),
          height: 0,
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(NEAREST_COLOR).withAlpha(0.95),
          outlineWidth: 4,
        },
      });

      GROUND_CAMERAS.forEach((cam) => {
        const entity = viewer.entities.getById(`cam-${cam.id}`);
        if (!entity) return;
        const near = findCamerasNearFootprint(sat, GROUND_CAMERAS).some((c) => c.id === cam.id);
        entity.show = near;
        if (entity.point) {
          entity.point.pixelSize = new Cesium.ConstantProperty(near ? 14 : 6);
          entity.point.color = new Cesium.ConstantProperty(
            Cesium.Color.fromCssColorString(near ? "#fb923c" : "#64748b"),
          );
        }
        if (entity.label) {
          entity.label.show = new Cesium.ConstantProperty(near);
        }
      });

      viewer.scene.morphTo2D(1.8);
      setTimeout(() => {
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            zoomBounds.west,
            zoomBounds.south,
            zoomBounds.east,
            zoomBounds.north,
          ),
          duration: 2.2,
        });
      }, 400);

      updateSatelliteStyles(nearestIdRef.current, sat.id);
      emitState({ phase: "map", footprintImageUrl: fp.imageUrl, activeCamera: null });
    },
    [emitState, updateSatelliteStyles],
  );

  useEffect(() => {
    if (!selectedSatelliteId || !ready) return;
    const sat = EAGLE_EYE_SATELLITES.find((s) => s.id === selectedSatelliteId);
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
        const tracks = tracksData.tracks;
        tracksRef.current = tracks;

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

        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap contributors",
          }),
        );

        viewer.clock.startTime = Cesium.JulianDate.fromDate(start);
        viewer.clock.stopTime = Cesium.JulianDate.fromDate(stop);
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(now);
        viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        viewer.clock.multiplier = 1;
        viewer.clock.shouldAnimate = true;

        if (viewer.timeline) {
          viewer.timeline.zoomTo(
            Cesium.JulianDate.fromDate(start),
            Cesium.JulianDate.fromDate(stop),
          );
        }

        tracks.forEach((track, idx) => {
          const color = SAT_COLORS[idx % SAT_COLORS.length];
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
                width: 2,
                material: Cesium.Color.fromCssColorString(PAST_COLOR).withAlpha(0.6),
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
                width: 2.5,
                material: new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.12,
                  color: Cesium.Color.fromCssColorString(FUTURE_COLOR).withAlpha(0.85),
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
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString(color),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
            label: {
              text: sat.name,
              font: "11px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12_000_000),
            },
            path: { show: false },
          });
        });

        GROUND_CAMERAS.forEach((cam) => {
          viewer!.entities.add({
            id: `cam-${cam.id}`,
            name: cam.name,
            position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 50),
            show: false,
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString("#fb923c"),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
            label: {
              text: `📷 ${cam.type}`,
              font: "10px sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#fb923c"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 12),
              show: false,
            },
          });
        });

        tickHandler = () => {
          if (!viewer || viewer.isDestroyed()) return;
          const clockDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
          const nearestId = findNearestImagingSatelliteId(tracksRef.current, clockDate);
          nearestIdRef.current = nearestId;

          const liveInfos = computeSatelliteLiveInfo(tracksRef.current, clockDate);
          const nearestInfo = liveInfos.find((i) => i.id === nearestId);
          const nearestSat = EAGLE_EYE_SATELLITES.find((s) => s.id === nearestId);

          setHud({
            speed: nearestInfo ? formatSpeedKmS(nearestInfo.speedKmS) : "—",
            nearest: nearestSat?.name ?? "—",
          });

          updateSatelliteStyles(nearestId, selectedSatRef.current?.id ?? null);

          if (!mapModeRef.current) {
            emitState({});
          }
        };
        viewer.clock.onTick.addEventListener(tickHandler);

        viewer.selectedEntityChanged.addEventListener((entity) => {
          if (!entity?.id || typeof entity.id !== "string") return;

          if (entity.id.startsWith("cam-")) {
            const camId = entity.id.replace("cam-", "");
            const cam = GROUND_CAMERAS.find((c) => c.id === camId);
            if (cam) {
              emitState({ phase: "live", activeCamera: cam });
            }
            return;
          }

          const sat = EAGLE_EYE_SATELLITES.find((s) => s.id === entity.id);
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
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [emitState, enterMapMode, updateSatelliteStyles]);

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
            <p className="text-amber-300/80">リアルタイム軌道</p>
            <p className="mt-0.5 font-mono text-sm text-white">{hud.speed}</p>
          </div>
          <div className="rounded-lg border border-cyan-400/20 bg-black/60 px-3 py-1.5 text-[10px] text-slate-300">
            撮影可能: <span className="text-amber-300">{hud.nearest}</span>
          </div>
        </div>
      )}
      {ready && !isMapMode && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-slate-300">
          🟡=撮影可能衛星 · 衛星クリック→地図クローズアップ
        </div>
      )}
      {ready && isMapMode && mapSatellite && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-lg bg-black/70 px-3 py-2 text-xs text-slate-300">
          <p className="text-amber-200/90">スキャン画像エリア</p>
          <p className="mt-0.5">{mapSatellite.footprint.label}</p>
          <p className="mt-1 text-[10px] text-slate-400">📷ピンをクリック → 地上カメラ映像を表示</p>
        </div>
      )}
    </div>
  );
}
