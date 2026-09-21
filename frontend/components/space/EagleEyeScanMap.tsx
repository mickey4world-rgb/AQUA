"use client";

/**
 * 上空写真モードの主地図（MapLibre + WebMercator）。
 * Cesium morphTo2D + imageryLayers は HUD 成功でも黒画面の再発クラスのため使わない。
 */
import { useEffect, useRef, useState } from "react";
import { GROUND_CAMERAS, type GroundCamera } from "@/lib/eagle-eye-data";
import { probeReachableImage } from "@/lib/eagle-eye-earth-imagery";

export type ScanMapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type EagleEyeScanMapProps = {
  bounds: ScanMapBounds;
  footprintLabel: string;
  selectedCameraId?: string | null;
  onSelectCamera?: (camera: GroundCamera) => void;
  onReady?: (basemapLabel: string) => void;
  onError?: (message: string) => void;
};

const MAPLIBRE_CSS =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const MAPLIBRE_JS =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js";

const CARTO_TILES = [
  "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
];
const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

function rasterStyle(tiles: string[], attribution: string) {
  return {
    version: 8 as const,
    sources: {
      basemap: {
        type: "raster" as const,
        tiles,
        tileSize: 256,
        attribution,
        maxzoom: 18,
      },
    },
    layers: [{ id: "basemap", type: "raster" as const, source: "basemap" }],
  };
}

type MapLibreMap = {
  remove: () => void;
  resize: () => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    opts?: { padding?: number; duration?: number },
  ) => void;
  addControl: (c: unknown) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData?: (data: unknown) => void } | undefined;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
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

async function pickWorkingStyle() {
  const cartoSample = CARTO_TILES[0]!.replace("{z}", "2").replace("{x}", "1").replace("{y}", "1");
  if (await probeReachableImage(cartoSample)) {
    return {
      style: rasterStyle(CARTO_TILES, "© CARTO · © OpenStreetMap"),
      label: "Carto Voyager",
    };
  }
  const osmSample = OSM_TILES[0]!.replace("{z}", "2").replace("{x}", "1").replace("{y}", "1");
  if (await probeReachableImage(osmSample)) {
    return {
      style: rasterStyle(OSM_TILES, "© OpenStreetMap"),
      label: "OpenStreetMap",
    };
  }
  throw new Error("無料地図タイル（Carto / OSM）に到達できません");
}

function footprintGeoJson(bounds: ScanMapBounds, label: string) {
  const { west, south, east, north } = bounds;
  return {
    type: "Feature" as const,
    properties: { label },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

function placeCameraMarkers(
  maplibregl: MapLibreNS,
  map: MapLibreMap,
  selectedCameraId: string | null | undefined,
  onSelect?: (camera: GroundCamera) => void,
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
      onSelect?.(cam);
    });
    markers.push(
      new maplibregl.Marker({ element: el })
        .setLngLat([cam.lon, cam.lat])
        .addTo(map),
    );
  }
  return markers;
}

export default function EagleEyeScanMap({
  bounds,
  footprintLabel,
  selectedCameraId,
  onSelectCamera,
  onReady,
  onError,
}: EagleEyeScanMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreNS | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const onSelectRef = useRef(onSelectCamera);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [basemapLabel, setBasemapLabel] = useState("準備中");

  onSelectRef.current = onSelectCamera;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      try {
        const picked = await pickWorkingStyle();
        if (cancelled || !containerRef.current) return;

        const maplibregl = await loadMapLibre();
        if (cancelled || !containerRef.current) return;
        maplibreRef.current = maplibregl;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: picked.style,
          center: [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2],
          zoom: 4,
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
          map.addSource("scan-footprint", {
            type: "geojson",
            data: footprintGeoJson(bounds, footprintLabel),
          });
          map.addLayer({
            id: "scan-footprint-fill",
            type: "fill",
            source: "scan-footprint",
            paint: {
              "fill-color": "#fbbf24",
              "fill-opacity": 0.18,
            },
          });
          map.addLayer({
            id: "scan-footprint-line",
            type: "line",
            source: "scan-footprint",
            paint: {
              "line-color": "#fbbf24",
              "line-width": 2,
              "line-opacity": 0.9,
            },
          });
          map.fitBounds(
            [
              [bounds.west, bounds.south],
              [bounds.east, bounds.north],
            ],
            { padding: 48, duration: 800 },
          );
          markersRef.current = placeCameraMarkers(
            maplibregl,
            map,
            selectedCameraId,
            (cam) => onSelectRef.current?.(cam),
          );
          onReadyRef.current?.(picked.label);
        });

        map.on("error", (...args: unknown[]) => {
          console.warn("[EagleEyeScanMap] map error", args[0]);
        });

        resizeObserver = new ResizeObserver(() => refreshSize());
        resizeObserver.observe(containerRef.current);
        requestAnimationFrame(refreshSize);
        setTimeout(refreshSize, 100);
        setTimeout(refreshSize, 400);
      } catch (error) {
        console.error("[EagleEyeScanMap]", error);
        const message =
          error instanceof Error ? error.message : "メルカトル地図を読み込めませんでした";
        if (!cancelled) {
          setLoadError(message);
          onErrorRef.current?.(message);
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
    // bounds はマウント時のスキャン領域。衛星切替は親が key で再マウントする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("scan-footprint");
    if (src?.setData) {
      src.setData(footprintGeoJson(bounds, footprintLabel));
      map?.fitBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        { padding: 48, duration: 600 },
      );
    }
  }, [bounds, footprintLabel]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = placeCameraMarkers(
      maplibregl,
      map,
      selectedCameraId,
      (cam) => onSelectRef.current?.(cam),
    );
  }, [selectedCameraId]);

  return (
    <div className="absolute inset-0 z-[6] overflow-hidden rounded-xl bg-[#0b1220]">
      <div ref={containerRef} className="h-full w-full" />
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
          <p className="text-sm text-rose-200">{loadError}</p>
        </div>
      )}
      {!loadError && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[10px] text-slate-300">
          MapLibre · {basemapLabel}（メルカトル）
        </div>
      )}
    </div>
  );
}
