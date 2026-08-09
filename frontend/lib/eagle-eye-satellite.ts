import { eciToGeodetic, gstime, propagate, twoline2satrec } from "satellite.js";
import type { EagleEyeSatelliteDef } from "@/lib/eagle-eye-data";
import {
  ORBIT_SAMPLE_MINUTES,
  ORBIT_WINDOW_MINUTES,
} from "@/lib/eagle-eye-data";

export interface SatellitePosition {
  time: Date;
  lat: number;
  lon: number;
  /** 高度 km */
  altKm: number;
  /** 現在時刻からの相対分（負=過去, 正=未来） */
  offsetMinutes: number;
}

export interface SatelliteTrack {
  satellite: EagleEyeSatelliteDef;
  positions: SatellitePosition[];
  /** 現在時刻のインデックス */
  nowIndex: number;
}

function propagateAt(
  satrec: ReturnType<typeof twoline2satrec>,
  date: Date,
): SatellitePosition | null {
  const pv = propagate(satrec, date);
  if (!pv?.position || typeof pv.position === "boolean") return null;

  const gmst = gstime(date);
  const gd = eciToGeodetic(pv.position, gmst);

  const lat = (gd.latitude * 180) / Math.PI;
  const lon = (gd.longitude * 180) / Math.PI;
  const altKm = gd.height;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(altKm)
  ) {
    return null;
  }

  return { time: date, lat, lon, altKm, offsetMinutes: 0 };
}

/** 現在時刻を中心に ±45分、1分刻みで衛星位置を計算 */
export function computeSatelliteTrack(
  satellite: EagleEyeSatelliteDef,
  referenceTime: Date = new Date(),
): SatelliteTrack {
  const satrec = twoline2satrec(satellite.tle1, satellite.tle2);
  const positions: SatellitePosition[] = [];

  for (
    let offset = -ORBIT_WINDOW_MINUTES;
    offset <= ORBIT_WINDOW_MINUTES;
    offset += ORBIT_SAMPLE_MINUTES
  ) {
    const time = new Date(referenceTime.getTime() + offset * 60_000);
    const pos = propagateAt(satrec, time);
    if (pos) {
      positions.push({ ...pos, offsetMinutes: offset });
    }
  }

  const nowIndex = positions.findIndex((p) => p.offsetMinutes === 0);

  return {
    satellite,
    positions,
    nowIndex: nowIndex >= 0 ? nowIndex : Math.floor(positions.length / 2),
  };
}

export function computeAllTracks(
  satellites: EagleEyeSatelliteDef[],
  referenceTime?: Date,
): SatelliteTrack[] {
  return satellites.map((s) => computeSatelliteTrack(s, referenceTime));
}

/** ハーバーサイン距離（km） */
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

/** クリック座標に最も近い地上カメラを特定 */
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

/** 指定時刻の衛星位置（Clock 連動用） */
export function getPositionAtTime(
  satellite: EagleEyeSatelliteDef,
  time: Date,
): SatellitePosition | null {
  const satrec = twoline2satrec(satellite.tle1, satellite.tle2);
  const pos = propagateAt(satrec, time);
  return pos;
}

export function formatAltitude(altKm: number): string {
  if (altKm >= 1000) return `${(altKm / 1000).toFixed(1)} 千 km`;
  return `${Math.round(altKm)} km`;
}
