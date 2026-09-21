"use client";

import { useEffect, useRef, useState } from "react";
import { stopMapEmoji } from "@/lib/travel-icons";
import type { TravelStop } from "@/lib/types/travel";
import { probeReachableImage } from "@/lib/eagle-eye-earth-imagery";
import { pickWorkingFreeBasemap } from "@/lib/maplibre-free-basemap";

type TravelMapProps = {
  stops: TravelStop[];
  selectedStopId: string | null;
  onSelectStop: (stop: TravelStop) => void;
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
  fitBounds: (
    bounds: [[number, number], [number, number]],
    opts?: { padding?: number; duration?: number; maxZoom?: number },
  ) => void;
  addControl: (c: unknown) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData?: (data: unknown) => void } | undefined;
  getLayer: (id: string) => unknown;
};

type MapLibreMarker = { remove: () => void };

type MapLibreNS = {
  Map: new (opts: Record<string, unknown>) => MapLibreMap;
  NavigationControl: new (opts?: Record<string, unknown>) => unknown;
  Marker: new (opts?: Record<string, unknown>) => {
    setLngLat: (lngLat: [number, number]) => {
      setPopup: (p: unknown) => {
        addTo: (map: MapLibreMap) => MapLibreMarker;
      };
      addTo: (map: MapLibreMap) => MapLibreMarker;
    };
  };
  Popup: new (opts?: Record<string, unknown>) => {
    setHTML: (html: string) => unknown;
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
    if (!document.querySelector("link[data-maplibre-travel]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      link.setAttribute("data-maplibre-travel", "true");
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

function stopsWithCoords(stops: TravelStop[]) {
  return stops.filter(
    (s) => typeof s.lat === "number" && typeof s.lon === "number",
  );
}

export default function TravelMap({
  stops,
  selectedStopId,
  onSelectStop,
  className,
}: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<MapLibreNS | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const onSelectRef = useRef(onSelectStop);
  const stopsRef = useRef(stops);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  onSelectRef.current = onSelectStop;
  stopsRef.current = stops;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      try {
        const picked = await pickWorkingFreeBasemap(probeReachableImage);
        if (cancelled || !containerRef.current) return;
        const maplibregl = await loadMapLibre();
        if (cancelled || !containerRef.current) return;
        maplibreRef.current = maplibregl;
        const mapped = stopsWithCoords(stopsRef.current);
        const center: [number, number] = mapped[0]
          ? [mapped[0].lon!, mapped[0].lat!]
          : [139.767, 35.681];

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: picked.style,
          center,
          zoom: mapped.length ? 11 : 5,
          attributionControl: true,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          map.addSource("travel-route", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "travel-route-line",
            type: "line",
            source: "travel-route",
            paint: {
              "line-color": "#2dd4bf",
              "line-width": 3,
              "line-opacity": 0.85,
            },
          });
          setMapReady(true);
        });

        ro = new ResizeObserver(() => map.resize());
        ro.observe(containerRef.current);
        requestAnimationFrame(() => map.resize());
      } catch (err) {
        console.error("[TravelMap]", err);
        if (!cancelled) setError("地図を読み込めませんでした");
      }
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      ro?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!mapReady || !map || !maplibregl) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const mapped = stopsWithCoords(stops).sort(
      (a, b) => a.dayIndex - b.dayIndex || a.order - b.order,
    );

    const coords = mapped.map((s) => [s.lon!, s.lat!] as [number, number]);
    const source = map.getSource("travel-route");
    source?.setData?.({
      type: "FeatureCollection",
      features:
        coords.length >= 2
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            ]
          : [],
    });

    for (const stop of mapped) {
      const el = document.createElement("button");
      el.type = "button";
      el.title = stop.name;
      const selected = stop.id === selectedStopId;
      el.className =
        "flex h-9 min-w-9 flex-col items-center justify-center rounded-2xl border-2 px-1 shadow-md transition " +
        (selected
          ? "border-amber-200 bg-amber-100 text-slate-900 scale-110"
          : "border-white bg-teal-50/95 text-slate-800");
      const emoji = document.createElement("span");
      emoji.className = "text-sm leading-none";
      emoji.textContent = stopMapEmoji(stop);
      const day = document.createElement("span");
      day.className = "text-[9px] font-bold leading-none text-teal-800";
      day.textContent = `D${stop.dayIndex + 1}`;
      el.appendChild(emoji);
      el.appendChild(day);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(stop);
      });
      markersRef.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([stop.lon!, stop.lat!])
          .addTo(map),
      );
    }

    if (mapped.length === 1) {
      map.flyTo({
        center: [mapped[0]!.lon!, mapped[0]!.lat!],
        zoom: 13,
        duration: 800,
      });
    } else if (mapped.length >= 2) {
      const lons = mapped.map((s) => s.lon!);
      const lats = mapped.map((s) => s.lat!);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 48, duration: 800, maxZoom: 12 },
      );
    }
  }, [stops, selectedStopId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !selectedStopId) return;
    const stop = stops.find((s) => s.id === selectedStopId);
    if (!stop || stop.lat == null || stop.lon == null) return;
    map.flyTo({ center: [stop.lon, stop.lat], zoom: 14, duration: 900 });
  }, [selectedStopId, stops, mapReady]);

  const mappedCount = stopsWithCoords(stops).length;

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-2xl border border-teal-400/25 bg-[#0b1c24] sm:h-[420px]"
      />
      {error ? (
        <p className="mt-1.5 text-[11px] text-rose-300">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500">
          MapLibre · 日付番号ピンと行程ライン。
          {mappedCount === 0 && stops.length > 0
            ? " 位置未確定の地点があります。「地図ピンを付ける」で座標を取得できます。"
            : " ピンを押すと詳細へ。"}
        </p>
      )}
    </div>
  );
}
