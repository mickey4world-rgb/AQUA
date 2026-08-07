import {
  IMAGING_ROI,
  type EagleEyeFootprint,
  type EagleEyeSatelliteDef,
} from "@/lib/eagle-eye-data";

export interface SortRoi {
  lat: number;
  lon: number;
  label?: string;
}

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
  satellites: EagleEyeSatelliteDef[];
  tracks: SatelliteTrackDto[];
}

export interface SatelliteLiveInfo {
  id: string;
  speedKmS: number;
  altKm: number;
  lat: number;
  lon: number;
  /** ソート基準地点からの距離 km */
  footprintDistKm: number;
}

export type EagleEyePhase = "orbit" | "map" | "live";

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

/** 衛星位置から動的フットプリントを生成 */
export function buildDynamicFootprint(
  lat: number,
  lon: number,
  altKm: number,
  sat: EagleEyeSatelliteDef,
): EagleEyeFootprint {
  const span = Math.max(0.25, Math.min(2.5, altKm / 350));
  const imageUrl =
    sat.footprint?.imageUrl ??
    sat.mediaUrl ??
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/640px-The_Earth_seen_from_Apollo_17.jpg";

  return {
    west: lon - span,
    east: lon + span,
    south: lat - span * 0.65,
    north: lat + span * 0.65,
    label: `${sat.name} — ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E スキャン`,
    imageUrl,
  };
}

export function resolveFootprintForSatellite(
  sat: EagleEyeSatelliteDef,
  lat: number,
  lon: number,
  altKm: number,
): EagleEyeFootprint {
  if (sat.footprint) return sat.footprint;
  return buildDynamicFootprint(lat, lon, altKm, sat);
}

export function getFootprintCenter(fp: EagleEyeFootprint): { lat: number; lon: number } {
  return {
    lat: (fp.south + fp.north) / 2,
    lon: (fp.west + fp.east) / 2,
  };
}

export function getFootprintZoomBounds(
  fp: EagleEyeFootprint,
  paddingRatio = 0.06,
): { west: number; south: number; east: number; north: number } {
  const latSpan = fp.north - fp.south;
  const lonSpan = fp.east - fp.west;
  return {
    west: fp.west - lonSpan * paddingRatio,
    south: fp.south - latSpan * paddingRatio,
    east: fp.east + lonSpan * paddingRatio,
    north: fp.north + latSpan * paddingRatio,
  };
}

export function isNearFootprintArea(
  lat: number,
  lon: number,
  fp: EagleEyeFootprint,
  paddingDeg = 0.06,
): boolean {
  return (
    lat >= fp.south - paddingDeg &&
    lat <= fp.north + paddingDeg &&
    lon >= fp.west - paddingDeg &&
    lon <= fp.east + paddingDeg
  );
}

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

export function getAltitudeFromTrack(
  track: SatelliteTrackDto,
  clockDate: Date,
): string {
  const pos = getPositionFromTrack(track, clockDate);
  return formatAltitude(pos.altKm);
}

export function formatAltitude(altKm: number): string {
  if (altKm >= 1000) return `${(altKm / 1000).toFixed(1)} 千 km`;
  return `${Math.round(altKm)} km`;
}

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

function imagingScore(info: SatelliteLiveInfo): number {
  const altPenalty = info.altKm > 1500 ? info.altKm / 5 : 0;
  return info.footprintDistKm + altPenalty;
}

export function computeSatelliteLiveInfo(
  tracks: SatelliteTrackDto[],
  clockDate: Date,
  roi: SortRoi = IMAGING_ROI,
): SatelliteLiveInfo[] {
  return tracks.map((track) => {
    const pos = getPositionFromTrack(track, clockDate);
    return {
      id: track.satellite.id,
      speedKmS: getOrbitalSpeedKmS(track, clockDate),
      altKm: pos.altKm,
      lat: pos.lat,
      lon: pos.lon,
      footprintDistKm: haversineKm(pos.lat, pos.lon, roi.lat, roi.lon),
    };
  });
}

export function findNearestImagingSatelliteId(
  tracks: SatelliteTrackDto[],
  clockDate: Date,
  roi: SortRoi = IMAGING_ROI,
): string | null {
  const infos = computeSatelliteLiveInfo(tracks, clockDate, roi);
  if (!infos.length) return null;
  infos.sort((a, b) => imagingScore(a) - imagingScore(b));
  return infos[0].id;
}

export function sortSatellitesByImaging(
  satellites: EagleEyeSatelliteDef[],
  liveInfos: SatelliteLiveInfo[],
  nearestId: string | null,
): EagleEyeSatelliteDef[] {
  const distMap = new Map(liveInfos.map((i) => [i.id, i.footprintDistKm]));

  return [...satellites].sort((a, b) => {
    const da = distMap.get(a.id) ?? Infinity;
    const db = distMap.get(b.id) ?? Infinity;
    if (da !== db) return da - db;
    if (a.id === nearestId) return -1;
    if (b.id === nearestId) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function findCamerasNearFootprint<T extends GroundCameraLike>(
  fp: EagleEyeFootprint,
  cameras: T[],
  paddingDeg = 0.08,
): T[] {
  const center = getFootprintCenter(fp);
  return cameras
    .filter((cam) => isNearFootprintArea(cam.lat, cam.lon, fp, paddingDeg))
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

/** カメラ視野の扇形頂点（地図用） */
export function buildCameraFovPolygon(
  lat: number,
  lon: number,
  headingDeg: number,
  fovDeg: number,
  rangeM: number,
): { lat: number; lon: number }[] {
  const rangeKm = rangeM / 1000;
  const half = fovDeg / 2;
  const points: { lat: number; lon: number }[] = [{ lat, lon }];

  for (let angle = headingDeg - half; angle <= headingDeg + half; angle += Math.max(5, fovDeg / 8)) {
    const rad = (angle * Math.PI) / 180;
    const dLat = (rangeKm / 111) * Math.cos(rad);
    const dLon = (rangeKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(rad);
    points.push({ lat: lat + dLat, lon: lon + dLon });
  }
  points.push({ lat, lon });
  return points;
}
