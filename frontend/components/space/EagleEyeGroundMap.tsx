"use client";

import { useEffect, useRef, useState } from "react";
import { GROUND_CAMERAS, type GroundCamera } from "@/lib/eagle-eye-data";
import { probeReachableImage } from "@/lib/eagle-eye-earth-imagery";
import { pickWorkingFreeBasemap } from "@/lib/maplibre-free-basemap";

type EagleEyeGroundMapProps = {
  selectedCameraId: string | null;
  onSelectCamera: (camera: GroundCamera) => void;
  className?: string;
};

const MAPLIBRE_CSS =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const MAPLIBRE_JS =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js";


type MapLibreMap = {
  remove: () => void;
  resize: () => void;
  flyTo: (opts: { center: [number, number]; zoom: number; duration?: number }) => void;
  addControl: (c: unknown) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  setStyle: (style: unknown) => void;
};

type MapLibreMarker = { remove: () => void };

type MapLibreNS = {
  Map: new (opts: Record<string, unknown>) => MapLibreMap;
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
  Marker: new (opts?: Record<string, unknown>) => {
    setLngLat: (lngLat: [number, number]) => {
      addTo: (map: MapLibreMap) => MapLibreMarker;
    };
  };
};

let maplibrePromise: Promise<MapLibreNS> | null = null;

function loadMapLibre(): Promise<MapLibreNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapLibre requires browser"));
  }
  const existing = (window as unknown as { maplibregl?: MapLibreNS }).maplibregl;
  if (existing) return Promise.resolve(existing);
  if (maplibrePromise) return maplibrePromise;

  maplibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-maplibre]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      link.setAttribute("data-maplibre", "true");
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS;
    script.async = true;
    script.onload = () => {
      const ns = (window as unknown as { maplibregl?: MapLibreNS }).maplibregl;
      if (ns) resolve(ns);
      else reject(new Error("MapLibre failed to load"));
    };
    script.onerror = () => reject(new Error("MapLibre script load failed"));
    document.body.appendChild(script);
  });
  return maplibrePromise;
}

function placeCameraMarkers(
  maplibregl: MapLibreNS,
  map: MapLibreMap,
  selectedCameraId: string | null,
  onSelect: (camera: GroundCamera) => void,
): MapLibreMarker[] {
  const markers: MapLibreMarker[] = [];
  for (const cam of GROUND_CAMERAS) {
    const el = document.createElement("button");
    el.type = "button";
    el.title = cam.name;
    el.setAttribute("aria-label", cam.name);
    el.className =
      "h-3.5 w-3.5 rounded-full border-2 border-white shadow " +
      (cam.id === selectedCameraId ? "bg-amber-400" : "bg-orange-500");
    el.style.cursor = "pointer";
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(cam);
    });
    markers.push(
      new maplibregl.Marker({ element: el })
        .setLngLat([cam.lon, cam.lat])
        .addTo(map),
    );
  }
  return markers;
}

/**
 * 地上カメラ用 2D 地図（MapLibre + 無料ラスタ）。
 * タイル probe → OSM DE / Esri 等。resize 必須（暗いままの空キャンバス防止）。
 * Carto 透かし（API KEY REQUIRED）は成功扱いにしない。
 */
export default function EagleEyeGroundMap({
  selectedCameraId,
  onSelectCamera,
  className,
}: EagleEyeGroundMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreNS | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const onSelectRef = useRef(onSelectCamera);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [basemapLabel, setBasemapLabel] = useState("準備中");
  onSelectRef.current = onSelectCamera;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      try {
        const picked = await pickWorkingFreeBasemap(probeReachableImage);
        if (cancelled || !containerRef.current) return;

        const maplibregl = await loadMapLibre();
        if (cancelled || !containerRef.current) return;
        maplibreRef.current = maplibregl;

        const selected =
          GROUND_CAMERAS.find((c) => c.id === selectedCameraId) ??
          GROUND_CAMERAS[0];

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: picked.style,
          center: [selected.lon, selected.lat],
          zoom: 11,
          attributionControl: true,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        mapRef.current = map;
        setBasemapLabel(picked.label);
        setLoadError(null);

        const refreshSize = () => {
          try {
            map.resize();
          } catch {
            /* ignore */
          }
        };

        map.on("load", () => {
          if (cancelled) return;
          refreshSize();
          markersRef.current = placeCameraMarkers(
            maplibregl,
            map,
            selectedCameraId,
            (cam) => onSelectRef.current(cam),
          );
        });

        map.on("error", (...args: unknown[]) => {
          console.warn("[EagleEyeGroundMap] map error", args[0]);
        });

        resizeObserver = new ResizeObserver(() => refreshSize());
        resizeObserver.observe(containerRef.current);
        // レイアウト確定後にもう一度
        requestAnimationFrame(refreshSize);
        setTimeout(refreshSize, 250);
      } catch (error) {
        console.error("[EagleEyeGroundMap]", error);
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "2D地図を読み込めませんでした",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl || !selectedCameraId) return;
    const cam = GROUND_CAMERAS.find((c) => c.id === selectedCameraId);
    if (!cam) return;
    map.resize();
    map.flyTo({ center: [cam.lon, cam.lat], zoom: 12.5, duration: 1100 });
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = placeCameraMarkers(
      maplibregl,
      map,
      selectedCameraId,
      (next) => onSelectRef.current(next),
    );
  }, [selectedCameraId]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-[220px] w-full overflow-hidden rounded-xl border border-cyan-400/20 bg-[#0b1220]"
      />
      {loadError ? (
        <p className="mt-1.5 text-[10px] text-rose-300">{loadError}</p>
      ) : (
        <p className="mt-1.5 text-[10px] text-slate-500">
          MapLibre · {basemapLabel}（無料タイル）。ピンで地上カメラへ移動。
        </p>
      )}
    </div>
  );
}
