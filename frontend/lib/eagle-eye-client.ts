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
