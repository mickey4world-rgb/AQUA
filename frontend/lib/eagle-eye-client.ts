import type { EagleEyeSatelliteDef } from "@/lib/eagle-eye-data";

export interface SatellitePositionDto {
  time: string;
  lat: number;
  lon: number;
  altKm: number;
  offsetMinutes: number;
}

export interface SatelliteTrackDto {
  satellite: EagleEyeSatelliteDef;
  positions: SatellitePositionDto[];
  nowIndex: number;
}

export interface EagleEyeTracksResponse {
  referenceTime: string;
  tracks: SatelliteTrackDto[];
}

export interface SatelliteLiveInfo {
  id: string;
  speedKmS: number;
  altKm: number;
  lat: number;
  lon: number;
  /** フットプリント中心からの距離 km（小さいほど撮影可能） */
  footprintDistKm: number;
}

export type EagleEyePhase = "orbit" | "map" | "live";

/** ハーバーサイン距離（km）— クライアント側 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GroundCameraLike {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export function findNearestCamera<T extends GroundCameraLike>(
  lat: number,
  lon: number,
  cameras: T[],
): { camera: T; distanceKm: number } | null {
  if (!cameras.length) return null;

  let best = cameras[0];
  let bestDist = haversineKm(lat, lon, best.lat, best.lon);

  for (let i = 1; i < cameras.length; i++) {
    const d = haversineKm(lat, lon, cameras[i].lat, cameras[i].lon);
    if (d < bestDist) {
      best = cameras[i];
      bestDist = d;
    }
  }

  return { camera: best, distanceKm: bestDist };
}

export function formatAltitude(altKm: number): string {
  if (altKm >= 1000) return `${(altKm / 1000).toFixed(1)} 千 km`;
  return `${Math.round(altKm)} km`;
}

/** トラックから現在位置の高度を取得 */
export function getAltitudeFromTrack(
  track: SatelliteTrackDto,
  clockDate: Date,
): string {
  const positions = track.positions;
  if (!positions.length) return "—";

  const targetMs = clockDate.getTime();
  let closest = positions[0];
  let minDiff = Math.abs(new Date(closest.time).getTime() - targetMs);

  for (const p of positions) {
    const diff = Math.abs(new Date(p.time).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }

  return formatAltitude(closest.altKm);
}

export function getFootprintCenter(sat: EagleEyeSatelliteDef): { lat: number; lon: number } {
  const fp = sat.footprint;
  return {
    lat: (fp.south + fp.north) / 2,
    lon: (fp.west + fp.east) / 2,
  };
}

/** スキャン画像フットプリント（③の画像エリア）に合わせたズーム範囲 */
export function getFootprintZoomBounds(
  sat: EagleEyeSatelliteDef,
  paddingRatio = 0.06,
): { west: number; south: number; east: number; north: number } {
  const fp = sat.footprint;
  const latSpan = fp.north - fp.south;
  const lonSpan = fp.east - fp.west;
  return {
    west: fp.west - lonSpan * paddingRatio,
    south: fp.south - latSpan * paddingRatio,
    east: fp.east + lonSpan * paddingRatio,
    north: fp.north + latSpan * paddingRatio,
  };
}

/** 座標がフットプリント（スキャン画像エリア）内または近傍か */
export function isNearFootprintArea(
  lat: number,
  lon: number,
  sat: EagleEyeSatelliteDef,
  paddingDeg = 0.06,
): boolean {
  const fp = sat.footprint;
  return (
    lat >= fp.south - paddingDeg &&
    lat <= fp.north + paddingDeg &&
    lon >= fp.west - paddingDeg &&
    lon <= fp.east + paddingDeg
  );
}

/** トラック上の指定時刻に最も近いサンプル位置 */
export function getPositionFromTrack(
  track: SatelliteTrackDto,
  clockDate: Date,
): SatellitePositionDto {
  const positions = track.positions;
  if (!positions.length) {
    return {
      time: clockDate.toISOString(),
      lat: 0,
      lon: 0,
      altKm: 0,
      offsetMinutes: 0,
    };
  }

  const targetMs = clockDate.getTime();
  let closest = positions[0];
  let minDiff = Math.abs(new Date(closest.time).getTime() - targetMs);

  for (const p of positions) {
    const diff = Math.abs(new Date(p.time).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }
  return closest;
}

/** 軌道速度 km/s（前後サンプルから算出） */
export function getOrbitalSpeedKmS(
  track: SatelliteTrackDto,
  clockDate: Date,
): number {
  const positions = track.positions;
  if (positions.length < 2) return 0;

  const targetMs = clockDate.getTime();
  let idx = 0;
  let minDiff = Infinity;
  positions.forEach((p, i) => {
    const diff = Math.abs(new Date(p.time).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      idx = i;
    }
  });

  const a = positions[Math.max(0, idx - 1)];
  const b = positions[Math.min(positions.length - 1, idx + 1)];
  const dtSec =
    Math.abs(new Date(b.time).getTime() - new Date(a.time).getTime()) / 1000;
  if (dtSec < 1) return 0;

  const dist = haversineKm(a.lat, a.lon, b.lat, b.lon);
  return dist / dtSec;
}

/** 各衛星のライブ情報を算出 */
export function computeSatelliteLiveInfo(
  tracks: SatelliteTrackDto[],
  clockDate: Date,
): SatelliteLiveInfo[] {
  return tracks.map((track) => {
    const pos = getPositionFromTrack(track, clockDate);
    const center = getFootprintCenter(track.satellite);
    return {
      id: track.satellite.id,
      speedKmS: getOrbitalSpeedKmS(track, clockDate),
      altKm: pos.altKm,
      lat: pos.lat,
      lon: pos.lon,
      footprintDistKm: haversineKm(pos.lat, pos.lon, center.lat, center.lon),
    };
  });
}

/** 現在フットプリント上空に最も近い（撮影可能な）衛星 ID */
export function findNearestImagingSatelliteId(
  tracks: SatelliteTrackDto[],
  clockDate: Date,
): string | null {
  const infos = computeSatelliteLiveInfo(tracks, clockDate);
  if (!infos.length) return null;
  infos.sort((a, b) => a.footprintDistKm - b.footprintDistKm);
  return infos[0].id;
}

/** 撮影可能順に衛星をソート（nearest 優先） */
export function sortSatellitesByImaging(
  satellites: EagleEyeSatelliteDef[],
  nearestId: string | null,
): EagleEyeSatelliteDef[] {
  return [...satellites].sort((a, b) => {
    if (a.id === nearestId) return -1;
    if (b.id === nearestId) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** スキャン画像エリア（③フットプリント）近傍の地上カメラ */
export function findCamerasNearFootprint<T extends GroundCameraLike>(
  sat: EagleEyeSatelliteDef,
  cameras: T[],
  paddingDeg = 0.06,
): T[] {
  const center = getFootprintCenter(sat);
  return cameras
    .filter((cam) => isNearFootprintArea(cam.lat, cam.lon, sat, paddingDeg))
    .map((cam) => ({
      cam,
      dist: haversineKm(center.lat, center.lon, cam.lat, cam.lon),
    }))
    .sort((a, b) => a.dist - b.dist)
    .map(({ cam }) => cam);
}

export function formatSpeedKmS(kmS: number): string {
  if (kmS >= 1) return `${kmS.toFixed(2)} km/s`;
  return `${(kmS * 1000).toFixed(0)} m/s`;
}
