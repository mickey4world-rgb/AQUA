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
  getGroundCameraIconDataUrl,
  getSatelliteIconDataUrl,
} from "@/lib/eagle-eye-icons";
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
/** Esri 衛星画像（失敗時は OSM / Carto にフォールバック） */
const ESRI_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const CARTO_VOYAGER =
  "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_LABELS =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

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
  groundCameras: GroundCamera[];
  sortPlaceLabel: string | null;
};

type EagleEyeViewerProps = {
  selectedSatelliteId?: string | null;
  selectNonce?: number;
  selectedCameraId?: string | null;
  cameraSelectNonce?: number;
  sortPlace?: SortRoi | null;
  /** 親からフェーズ切替を要求 */
  phaseRequest?: { phase: EagleEyePhase; nonce: number } | null;
  onStateChange?: (state: EagleEyeViewerState) => void;
};

type CesiumModule = {
  // CDN global; keep intentionally loose (no npm cesium package).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumViewer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumEntity = any;

const NEAREST_COLOR = "#fbbf24";
const PAST_COLOR = "#64748b";
const FUTURE_COLOR = "#38bdf8";

let cesiumLoadPromise: Promise<CesiumModule> | null = null;

function loadCesium(): Promise<CesiumModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cesium requires browser"));
  }
  if ((window as unknown as { Cesium?: CesiumModule }).Cesium) {
    return Promise.resolve(
      (window as unknown as { Cesium: CesiumModule }).Cesium,
    );
  }
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL =
      CESIUM_BASE;

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
  const palette = [
    "#60a5fa",
    "#34d399",
    "#f472b6",
    "#a78bfa",
    "#fb923c",
    "#2dd4bf",
  ];
  return palette[idx % palette.length];
}

function addMapImagery(
  viewer: CesiumViewer,
  Cesium: CesiumModule,
  withLabels: boolean,
  preferSatellite = true,
) {
  viewer.imageryLayers.removeAll();
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0b3d91");

  const urls = preferSatellite
    ? [ESRI_IMAGERY, CARTO_VOYAGER, OSM_TILES]
    : [CARTO_VOYAGER, OSM_TILES, ESRI_IMAGERY];

  for (const url of urls) {
    try {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url,
          maximumLevel: 19,
          credit: url.includes("arcgisonline")
            ? "Esri"
            : url.includes("cartocdn")
              ? "Carto"
              : "OSM",
        }),
      );
      break;
    } catch {
      // try next provider
    }
  }

  if (withLabels) {
    try {
      const labels = viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: ESRI_LABELS,
          maximumLevel: 18,
          credit: "Esri Labels",
        }),
      );
      labels.alpha = 0.9;
    } catch {
      // labels optional
    }
  }
}

export default function EagleEyeViewer({
  selectedSatelliteId = null,
  selectNonce = 0,
  selectedCameraId = null,
  cameraSelectNonce = 0,
  sortPlace = null,
  phaseRequest = null,
  onStateChange,
}: EagleEyeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const tracksRef = useRef<SatelliteTrackDto[]>([]);
  const satellitesRef = useRef<EagleEyeSatelliteDef[]>([]);
  const footprintRef = useRef<CesiumEntity | null>(null);
  const activeFootprintRef = useRef<EagleEyeFootprint | null>(null);
  const nearestIdRef = useRef<string | null>(null);
  const selectedSatRef = useRef<EagleEyeSatelliteDef | null>(null);
  const mapModeRef = useRef(false);
  const sortPlaceRef = useRef<SortRoi>(IMAGING_ROI);
  const onStateChangeRef = useRef(onStateChange);

  // 以降の effect や Cesium のコールバックから常に最新の値を見られるようにする。
  // この2つは他の effect より先に宣言しておくこと。
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    sortPlaceRef.current = sortPlace ?? IMAGING_ROI;
  }, [sortPlace]);

  const [ready, setReady] = useState(false);
  const [isMapMode, setIsMapMode] = useState(false);
  const [mapSatellite, setMapSatellite] = useState<EagleEyeSatelliteDef | null>(
    null,
  );
  const [footprintLabel, setFootprintLabel] = useState<string | null>(null);
  const [hud, setHud] = useState({
    speed: "—",
    nearest: "",
    count: 0,
    place: "東京",
  });

  const emitState = useCallback((patch: Partial<EagleEyeViewerState>) => {
    const viewer = viewerRef.current;
    const clockDate =
      viewer && cesiumRef.current
        ? cesiumRef.current.JulianDate.toDate(viewer.clock.currentTime)
        : new Date();
    const tracks = tracksRef.current;
    const roi = sortPlaceRef.current;
    const liveInfos = computeSatelliteLiveInfo(tracks, clockDate, roi);
    const nearestSatelliteId = findNearestImagingSatelliteId(
      tracks,
      clockDate,
      roi,
    );
    nearestIdRef.current = nearestSatelliteId;

    const selected = selectedSatRef.current;
    const track = selected
      ? tracks.find((t) => t.satellite.id === selected.id)
      : null;
    const fp = activeFootprintRef.current;

    const base: EagleEyeViewerState = {
      phase: mapModeRef.current ? "map" : "orbit",
      selectedSatellite: selected,
      selectedFootprint: fp,
      nearestSatelliteId,
      satelliteAltitude: track ? getAltitudeFromTrack(track, clockDate) : null,
      orbitalSpeedKmS: track
        ? (liveInfos.find((i) => i.id === track.satellite.id)?.speedKmS ?? null)
        : (liveInfos.find((i) => i.id === nearestSatelliteId)?.speedKmS ??
          null),
      activeCamera: null,
      footprintImageUrl: fp?.imageUrl ?? selected?.mediaUrl ?? null,
      liveStreamUrl: selected?.liveStreamUrl ?? null,
      liveInfos,
      satelliteCount: satellitesRef.current.length,
      satellites: satellitesRef.current,
      groundCameras: GROUND_CAMERAS,
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
        if (!entity) return;

        const isNearest = sat.id === nearestId;
        const isSelected = sat.id === selectedId;
        const color = isNearest || isSelected ? NEAREST_COLOR : satColor(idx);
        const scale = isSelected ? 1.35 : isNearest ? 1.2 : 0.9;

        if (entity.billboard) {
          entity.billboard.image = new Cesium.ConstantProperty(
            getSatelliteIconDataUrl(color),
          );
          entity.billboard.scale = new Cesium.ConstantProperty(scale);
        }
        if (entity.label) {
          entity.label.show = new Cesium.ConstantProperty(
            isSelected || isNearest,
          );
        }
      });
    },
    [],
  );

  const showMapCameras = useCallback((_show?: boolean) => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    // 地上カメラは常時ピン表示（河川・道路・個人公開などを拾う）
    GROUND_CAMERAS.forEach((cam) => {
      const fovEntity = viewer.entities.getById(`cam-fov-${cam.id}`);
      const pinEntity = viewer.entities.getById(`cam-${cam.id}`);
      if (!pinEntity) return;

      pinEntity.show = true;
      if (fovEntity) fovEntity.show = true;
      if (pinEntity.label) {
        pinEntity.label.show = new Cesium.ConstantProperty(true);
      }
      if (pinEntity.billboard) {
        pinEntity.billboard.scale = new Cesium.ConstantProperty(1.05);
      }
    });
  }, []);

  const flyToGroundCamera = useCallback((cam: GroundCamera) => {
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
  }, []);

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
      setFootprintLabel(fp?.label ?? null);

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
                coordinates: Cesium.Rectangle.fromDegrees(
                  fp.west,
                  fp.south,
                  fp.east,
                  fp.north,
                ),
                material:
                  Cesium.Color.fromCssColorString(NEAREST_COLOR).withAlpha(
                    0.12,
                  ),
                height: 0,
                outline: true,
                outlineColor:
                  Cesium.Color.fromCssColorString(NEAREST_COLOR).withAlpha(0.9),
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
    setFootprintLabel(null);

    if (footprintRef.current) {
      viewer.entities.remove(footprintRef.current);
      footprintRef.current = null;
    }

    addMapImagery(viewer, Cesium, false, true);
    showMapCameras(true);
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
    if (!selectedCameraId || !ready) return;
    const cam = GROUND_CAMERAS.find((c) => c.id === selectedCameraId);
    if (!cam) return;
    showMapCameras(true);
    flyToGroundCamera(cam);
    emitState({ phase: "live", activeCamera: cam });
  }, [
    selectedCameraId,
    cameraSelectNonce,
    ready,
    showMapCameras,
    flyToGroundCamera,
    emitState,
  ]);

  useEffect(() => {
    if (!ready || !sortPlace) return;
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    const clockDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const nearestId = findNearestImagingSatelliteId(
      tracksRef.current,
      clockDate,
      sortPlace,
    );
    nearestIdRef.current = nearestId;
    updateSatelliteStyles(nearestId, selectedSatRef.current?.id ?? null);

    const nearestSat =
      satellitesRef.current.find((s) => s.id === nearestId) ?? null;
    const liveInfos = computeSatelliteLiveInfo(
      tracksRef.current,
      clockDate,
      sortPlace,
    );
    emitState({
      nearestSatelliteId: nearestId,
      sortPlaceLabel: sortPlace.label ?? null,
      liveInfos,
    });
  }, [sortPlace, ready, emitState, updateSatelliteStyles]);

  useEffect(() => {
    if (!ready || !phaseRequest) return;
    if (phaseRequest.phase === "orbit") {
      exitMapMode();
      return;
    }
    if (phaseRequest.phase === "map") {
      const sat =
        selectedSatRef.current ||
        satellitesRef.current.find((s) => s.id === nearestIdRef.current) ||
        satellitesRef.current[0];
      if (sat) enterMapMode(sat);
      return;
    }
    if (phaseRequest.phase === "live") {
      showMapCameras(true);
      const cam =
        GROUND_CAMERAS.find((c) =>
          Math.abs(c.lat - (sortPlaceRef.current.lat ?? 35.68)) < 1.5,
        ) ?? GROUND_CAMERAS[0];
      if (cam) {
        flyToGroundCamera(cam);
        emitState({ phase: "live", activeCamera: cam });
      }
    }
  }, [
    phaseRequest,
    ready,
    exitMapMode,
    enterMapMode,
    showMapCameras,
    flyToGroundCamera,
    emitState,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let viewer: CesiumViewer | null = null;
    let tickHandler: (() => void) | null = null;

    loadCesium()
      .then(async (Cesium) => {
        if (destroyed || !containerRef.current) return;
        cesiumRef.current = Cesium;

        const tracksRes = await fetch("/api/space/eagle-eye/tracks");
        if (!tracksRes.ok) throw new Error("Failed to load satellite tracks");
        const tracksData = (await tracksRes.json()) as EagleEyeTracksResponse;
        tracksRef.current = tracksData.tracks;
        satellitesRef.current =
          tracksData.satellites ?? tracksData.tracks.map((t) => t.satellite);

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
          // Ion 無しでも地球が見えるよう、初期レイヤを付けない
          baseLayer: false,
        } as ConstructorParameters<typeof Cesium.Viewer>[1]);

        addMapImagery(viewer, Cesium, false, true);
        viewer.scene.globe.show = true;
        viewer.scene.globe.enableLighting = false;

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
                material:
                  Cesium.Color.fromCssColorString(PAST_COLOR).withAlpha(0.45),
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
                  color:
                    Cesium.Color.fromCssColorString(FUTURE_COLOR).withAlpha(
                      0.65,
                    ),
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
            billboard: {
              image: getSatelliteIconDataUrl(color),
              width: 28,
              height: 28,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: sat.country
                ? `${sat.name}\n${sat.country}`
                : sat.name,
              font: "10px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -16),
              show: false,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                0,
                8_000_000,
              ),
            },
          });
        });

        GROUND_CAMERAS.forEach((cam) => {
          const pinColor = GROUND_PIN_COLORS[cam.mediaType];
          const fovPoints = buildCameraFovPolygon(
            cam.lat,
            cam.lon,
            cam.headingDeg,
            cam.fovDeg,
            cam.rangeM,
          );

          viewer!.entities.add({
            id: `cam-fov-${cam.id}`,
            show: true,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(
                fovPoints.flatMap((p) => [p.lon, p.lat]),
              ),
              material:
                Cesium.Color.fromCssColorString(pinColor).withAlpha(0.18),
              outline: true,
              outlineColor:
                Cesium.Color.fromCssColorString(pinColor).withAlpha(0.7),
              height: 0,
            },
          });

          viewer!.entities.add({
            id: `cam-${cam.id}`,
            name: cam.name,
            position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 50),
            show: true,
            billboard: {
              image: getGroundCameraIconDataUrl(pinColor),
              width: 34,
              height: 34,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `${cam.name}\n${cam.country}${cam.region ? ` · ${cam.region}` : ""}`,
              font: "10px sans-serif",
              fillColor: Cesium.Color.fromCssColorString(pinColor),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 8),
              show: true,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                0,
                2_500_000,
              ),
            },
          });
        });

        tickHandler = () => {
          if (!viewer || viewer.isDestroyed()) return;
          const clockDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
          const roi = sortPlaceRef.current;
          const nearestId = findNearestImagingSatelliteId(
            tracksRef.current,
            clockDate,
            roi,
          );
          nearestIdRef.current = nearestId;

          const liveInfos = computeSatelliteLiveInfo(
            tracksRef.current,
            clockDate,
            roi,
          );
          const nearestInfo = liveInfos.find((i) => i.id === nearestId);
          const nearestSat = satellitesRef.current.find(
            (s) => s.id === nearestId,
          );

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

        viewer.selectedEntityChanged.addEventListener((entity: CesiumEntity) => {
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
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden rounded-xl"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70">
          <p className="text-sm text-slate-300">
            鷹の目 — 3D地球を読み込み中...
          </p>
        </div>
      )}
      {ready && (
        <div className="pointer-events-none absolute left-3 top-3 space-y-1.5">
          <div className="rounded-lg border border-amber-400/30 bg-black/70 px-3 py-2 text-xs">
            <p className="text-amber-300/80">
              リアルタイム軌道 · {hud.count}機
            </p>
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
          <p className="mt-0.5">{footprintLabel ?? mapSatellite.name}</p>
          <p className="mt-1 text-[10px] text-slate-400">
            🎥=映像ピン · 🖼=画像ピン · クリックで地上へ降下
          </p>
        </div>
      )}
    </div>
  );
}
