import * as THREE from "three";
import type { CloseApproach } from "@/lib/types/space";

export const EARTH_ORBIT = 4;
export const SUN_RADIUS = 0.65;

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
  closestProgress: number;
  closestPoint: THREE.Vector3;
  missDistanceVisual: number;
  asteroidSize: number;
  animationSpeed: number;
  approachDirection: THREE.Vector3;
};

export function earthPosition(angle: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(angle) * EARTH_ORBIT,
    0,
    Math.sin(angle) * EARTH_ORBIT,
  );
}

export function buildAsteroidOrbit(approach: CloseApproach): AsteroidOrbitModel {
  const seed = hashString(`${approach.designation}|${approach.closeApproachDate}`);
  const earthAngle = ((seed % 360) * Math.PI) / 180;
  const earthPos = earthPosition(earthAngle);

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
    earthAngle,
    closestProgress: 0.5,
    closestPoint: closest,
    missDistanceVisual,
    asteroidSize,
    animationSpeed,
    approachDirection: approachDir,
  };
}

export function orbitPhaseLabel(progress: number, closestProgress: number): string {
  if (progress < closestProgress - 0.12) return "地球に接近中";
  if (progress < closestProgress + 0.12) return "最接近付近";
  return "地球から離脱中";
}
