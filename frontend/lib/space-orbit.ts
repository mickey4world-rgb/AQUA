import * as THREE from "three";
import type { CloseApproach } from "@/lib/types/space";

export const EARTH_ORBIT = 4;
export const SUN_RADIUS = 0.65;
export const MOON_ORBIT = 0.55;

export const MERCURY_ORBIT = 2.4;
export const VENUS_ORBIT = 3.0;
export const MARS_ORBIT = 6.2;
export const JUPITER_ORBIT = 8.5;
export const SATURN_ORBIT = 10.5;

/** 公転周期（地球年） */
export const PLANET_PERIOD_YEARS: Record<string, number> = {
  mercury: 0.240846,
  venus: 0.615198,
  earth: 1,
  mars: 1.88082,
  jupiter: 11.862,
  saturn: 29.457,
};

export const PLANET_ORBIT_SPEED: Record<string, number> = {
  mercury: 0.12,
  venus: 0.08,
  mars: 0.045,
  jupiter: 0.025,
  saturn: 0.018,
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export type AsteroidOrbitModel = {
  curve: THREE.CatmullRomCurve3;
  earthAngle: number;
  planetAngles: Record<string, number>;
  closestProgress: number;
  closestPoint: THREE.Vector3;
  missDistanceVisual: number;
  asteroidSize: number;
  animationSpeed: number;
  approachDirection: THREE.Vector3;
  /** アニメ全体がカバーする日数（最接近を中央に） */
  animationSpanDays: number;
};

export function earthPosition(angle: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(angle) * EARTH_ORBIT,
    0,
    Math.sin(angle) * EARTH_ORBIT,
  );
}

export function planetPosition(angle: number, radius: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

/**
 * 接近日時から、その瞬間の各惑星の公転角を決める。
 * 絶対的な天文学精度ではなく、接近日に連動して揃えるための簡易モデル。
 */
export function planetaryAnglesAtMs(atMs: number, seed: number): {
  earth: number;
  planets: Record<string, number>;
} {
  const day = atMs / 86_400_000;
  const yearPhase = ((day % 365.25) / 365.25) * Math.PI * 2;
  const earth = yearPhase + ((seed % 40) * Math.PI) / 180;

  const planets: Record<string, number> = {};
  for (const [id, period] of Object.entries(PLANET_PERIOD_YEARS)) {
    if (id === "earth") continue;
    const base = ((seed >> (id.charCodeAt(0) % 12)) % 360) * (Math.PI / 180);
    planets[id] = base + yearPhase / period;
  }
  return { earth, planets };
}

/** progress(0〜1) に応じて接近前後の日数オフセットを返す（0.5 = 最接近） */
export function dayOffsetForProgress(progress: number, spanDays: number): number {
  return (progress - 0.5) * spanDays;
}

export function angleAfterDays(
  baseAngle: number,
  days: number,
  periodYears: number,
): number {
  return baseAngle + (days / (365.25 * periodYears)) * Math.PI * 2;
}

export function buildAsteroidOrbit(approach: CloseApproach): AsteroidOrbitModel {
  const seed = hashString(`${approach.designation}|${approach.closeApproachDate}`);
  const at = approach.closeApproachAt || Date.now();
  const { earth: earthAngleAtClosest, planets: planetAnglesAtClosest } =
    planetaryAnglesAtMs(at, seed);

  const earthPos = earthPosition(earthAngleAtClosest);

  const missDistanceVisual = Math.max(0.2, approach.distanceMinAu * 16);
  const incline = (((seed >> 8) % 50) - 25) * (Math.PI / 180);
  const azimuth = (((seed >> 16) % 360) * Math.PI) / 180;

  const approachDir = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(incline),
    Math.sin(incline),
    Math.sin(azimuth) * Math.cos(incline),
  ).normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const missAxis = new THREE.Vector3().crossVectors(approachDir, up).normalize();
  if (missAxis.lengthSq() < 0.01) missAxis.set(1, 0, 0);

  const missOffset = missAxis.multiplyScalar(missDistanceVisual);

  const start = earthPos.clone().add(approachDir.clone().multiplyScalar(11));
  const inbound = earthPos.clone().add(approachDir.clone().multiplyScalar(3.5)).add(
    missOffset.clone().multiplyScalar(0.55),
  );
  const closest = earthPos.clone().add(missOffset);
  const outbound = earthPos.clone().add(approachDir.clone().multiplyScalar(-3.5)).add(
    missOffset.clone().multiplyScalar(0.45),
  );
  const end = earthPos.clone().add(approachDir.clone().multiplyScalar(-11));

  const curve = new THREE.CatmullRomCurve3([start, inbound, closest, outbound, end]);

  const asteroidSize = approach.diameterKm
    ? Math.min(0.16, Math.max(0.045, approach.diameterKm / 600))
    : Math.min(0.12, Math.max(0.05, (22 - approach.absoluteMagnitude) / 120));

  const animationSpeed = Math.min(0.22, Math.max(0.08, approach.velocityKmS / 55));

  return {
    curve,
    earthAngle: earthAngleAtClosest,
    planetAngles: planetAnglesAtClosest,
    closestProgress: 0.5,
    closestPoint: closest,
    missDistanceVisual,
    asteroidSize,
    animationSpeed,
    approachDirection: approachDir,
    animationSpanDays: 16,
  };
}

export function orbitPhaseLabel(progress: number, closestProgress: number): string {
  if (progress < closestProgress - 0.12) return "地球に接近中";
  if (progress < closestProgress + 0.12) return "最接近付近";
  return "地球から離脱中";
}
