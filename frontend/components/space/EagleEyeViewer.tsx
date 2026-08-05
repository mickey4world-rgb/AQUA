"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EAGLE_EYE_SATELLITES,
  GROUND_CAMERAS,
  type GroundCamera,
} from "@/lib/eagle-eye-data";
import {
  findNearestCamera,
  getAltitudeFromTrack,
  type EagleEyeTracksResponse,
  type SatelliteTrackDto,
} from "@/lib/eagle-eye-client";
import type { EagleEyeSatelliteDef } from "@/lib/eagle-eye-data";

const CESIUM_VERSION = "1.144.0";
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;

export type EagleEyeViewerState = {
  selectedSatellite: EagleEyeSatelliteDef | null;
  satelliteAltitude: string | null;
  activeCamera: GroundCamera | null;
  clickLat: number | null;
  clickLon: number | null;
  phase: "orbit" | "scanning" | "zooming" | "live";
};

type EagleEyeViewerProps = {
  onStateChange?: (state: EagleEyeViewerState) => void;
};

type CesiumModule = typeof import("cesium");

const SAT_COLORS = ["#60a5fa", "#34d399", "#f472b6"] as const;
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

export default function EagleEyeViewer({ onStateChange }: EagleEyeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const footprintRef = useRef<import("cesium").Entity | null>(null);
  const selectedSatRef = useRef<EagleEyeSatelliteDef | null>(null);

  const [ready, setReady] = useState(false);
  const [viewerState, setViewerState] = useState<EagleEyeViewerState>({
    selectedSatellite: null,
    satelliteAltitude: null,
    activeCamera: null,
    clickLat: null,
    clickLon: null,
    phase: "orbit",
  });

  const updateState = useCallback(
    (patch: Partial<EagleEyeViewerState>) => {
      setViewerState((prev) => {
        const next = { ...prev, ...patch };
        onStateChange?.(next);
        return next;
      });
    },
    [onStateChange],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let viewer: import("cesium").Viewer | null = null;

    loadCesium()
      .then(async (Cesium) => {
        if (destroyed || !containerRef.current) return;

        const tracksRes = await fetch("/api/space/eagle-eye/tracks");
        if (!tracksRes.ok) throw new Error("Failed to load satellite tracks");
        const tracksData = (await tracksRes.json()) as EagleEyeTracksResponse;
        const tracks = tracksData.tracks;

        viewer = new Cesium.Viewer(containerRef.current, {
          animation: true,
          timeline: true,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          fullscreenButton: true,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          infoBox: true,
          selectionIndicator: true,
        });

        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap contributors",
          }),
        );

        const now = new Date(tracksData.referenceTime);
        const start = new Date(now.getTime() - 45 * 60_000);
        const stop = new Date(now.getTime() + 45 * 60_000);

        viewer.clock.startTime = Cesium.JulianDate.fromDate(start);
        viewer.clock.stopTime = Cesium.JulianDate.fromDate(stop);
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(now);
        viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        viewer.clock.multiplier = 120;
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
                material: Cesium.Color.fromCssColorString(PAST_COLOR).withAlpha(0.7),
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
                  glowPower: 0.15,
                  color: Cesium.Color.fromCssColorString(FUTURE_COLOR).withAlpha(0.9),
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
              pixelSize: 12,
              color: Cesium.Color.fromCssColorString(color),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
            label: {
              text: sat.name,
              font: "12px sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
            },
            path: { show: false },
            description: buildSatelliteDescription(sat, track),
          });
        });

        GROUND_CAMERAS.forEach((cam) => {
          viewer!.entities.add({
            id: `cam-${cam.id}`,
            name: cam.name,
            position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 80),
            point: {
              pixelSize: 8,
              color: Cesium.Color.ORANGE,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
            },
            label: {
              text: `📷 ${cam.type}`,
              font: "10px sans-serif",
              fillColor: Cesium.Color.ORANGE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 10),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50_000),
            },
          });
        });

        viewer.selectedEntityChanged.addEventListener((entity) => {
          if (!entity?.id || typeof entity.id !== "string") return;
          const sat = EAGLE_EYE_SATELLITES.find((s) => s.id === entity.id);
          if (!sat) return;

          selectedSatRef.current = sat;
          const currentTime = Cesium.JulianDate.toDate(viewer!.clock.currentTime);
          const track = tracks.find((t) => t.satellite.id === sat.id);
          const altStr = track ? getAltitudeFromTrack(track, currentTime) : "—";

          updateState({
            selectedSatellite: sat,
            satelliteAltitude: altStr,
            phase: "scanning",
            activeCamera: null,
          });

          showFootprint(viewer!, Cesium, sat);
        });

        viewer.screenSpaceEventHandler.setInputAction(
          (click: { position: import("cesium").Cartesian2 }) => {
            const picked = viewer!.scene.pick(click.position);
            if (picked?.id?.id && typeof picked.id.id === "string") {
              const satId = EAGLE_EYE_SATELLITES.find((s) => s.id === picked.id.id);
              if (satId) return;
            }

            if (!selectedSatRef.current) return;

            const ray = viewer!.camera.getPickRay(click.position);
            if (!ray) return;
            const cartesian = viewer!.scene.globe.pick(ray, viewer!.scene);
            if (!cartesian) return;

            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            const lon = Cesium.Math.toDegrees(carto.longitude);

            updateState({ clickLat: lat, clickLon: lon, phase: "zooming" });

            const nearest = findNearestCamera(lat, lon, GROUND_CAMERAS);
            if (!nearest) return;

            viewer!.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(
                nearest.camera.lon,
                nearest.camera.lat,
                800,
              ),
              orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0,
              },
              duration: 2.8,
              complete: () => {
                updateState({ activeCamera: nearest.camera, phase: "live" });
              },
            });
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );

        viewerRef.current = viewer;
        setReady(true);
      })
      .catch((err) => {
        console.error("[EagleEye] Cesium load failed:", err);
      });

    return () => {
      destroyed = true;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [updateState]);

  function showFootprint(
    viewer: import("cesium").Viewer,
    Cesium: CesiumModule,
    sat: EagleEyeSatelliteDef,
  ) {
    if (footprintRef.current) {
      viewer.entities.remove(footprintRef.current);
    }

    const fp = sat.footprint;
    const entity = viewer.entities.add({
      id: `${sat.id}-footprint`,
      name: fp.label,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(fp.west, fp.south, fp.east, fp.north),
        material: new Cesium.ImageMaterialProperty({
          image: fp.imageUrl,
          transparent: true,
        }),
        height: 0,
        outline: true,
        outlineColor: Cesium.Color.CYAN.withAlpha(0.9),
        outlineWidth: 3,
      },
      description: `<p>${fp.label}</p><p>クリックで地上カメラへズームイン</p>`,
    });

    footprintRef.current = entity;

    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(fp.west, fp.south, fp.east, fp.north),
      duration: 2.5,
    });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70">
          <p className="text-sm text-slate-300">鷹の目 — 3D地球を読み込み中...</p>
        </div>
      )}
      {ready && viewerState.phase === "orbit" && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-slate-300">
          衛星ピンをクリック → スキャンエリア表示 → 地図クリックで地上カメラへ
        </div>
      )}
    </div>
  );
}

function buildSatelliteDescription(
  sat: EagleEyeSatelliteDef,
  track: SatelliteTrackDto,
): string {
  const nowPos = track.positions[track.nowIndex];
  const alt = nowPos ? `${Math.round(nowPos.altKm)} km` : "—";
  return `
    <table class="cesium-infoBox-defaultTable">
      <tr><th>衛星名</th><td>${sat.name}</td></tr>
      <tr><th>現在高度</th><td>${alt}</td></tr>
      <tr><th>監視エリア</th><td>${sat.footprint.label}</td></tr>
    </table>
    <p style="margin-top:8px">衛星を選択後、スキャンエリアをクリックすると最寄りの地上カメラへズームします。</p>
  `;
}
