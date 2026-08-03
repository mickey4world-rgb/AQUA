"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Line } from "@react-three/drei";
import * as THREE from "three";
import type { CloseApproach } from "@/lib/types/space";

const EARTH_ORBIT = 4;
const SUN_RADIUS = 0.55;
const EARTH_RADIUS = 0.18;

type SceneProps = {
  approach: CloseApproach;
  progress: number;
  playing: boolean;
  onProgress: (value: number) => void;
};

function SunMesh() {
  return (
    <mesh>
      <sphereGeometry args={[SUN_RADIUS, 32, 32]} />
      <meshBasicMaterial color="#fbbf24" />
      <pointLight intensity={3} distance={50} color="#fde68a" />
      <pointLight intensity={1.2} distance={80} color="#f97316" />
    </mesh>
  );
}

function EarthOrbitRing() {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 64; i += 1) {
      const a = (i / 64) * Math.PI * 2;
      pts.push([Math.cos(a) * EARTH_ORBIT, 0, Math.sin(a) * EARTH_ORBIT]);
    }
    return pts;
  }, []);

  return (
    <Line
      points={points}
      color="#334155"
      transparent
      opacity={0.5}
      lineWidth={1}
    />
  );
}

function EarthMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const angleRef = useRef(0.4);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    angleRef.current += delta * 0.08;
    const a = angleRef.current;
    groupRef.current.position.set(
      Math.cos(a) * EARTH_ORBIT,
      0,
      Math.sin(a) * EARTH_ORBIT,
    );
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 32, 32]} />
        <meshStandardMaterial
          color="#2563eb"
          emissive="#1e40af"
          emissiveIntensity={0.35}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

function AsteroidPath({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const points = useMemo(
    () => curve.getPoints(80).map((p) => [p.x, p.y, p.z] as [number, number, number]),
    [curve],
  );

  return (
    <Line
      points={points}
      color="#f97316"
      transparent
      opacity={0.85}
      lineWidth={2}
    />
  );
}

function AsteroidMesh({
  curve,
  progress,
  size,
}: {
  curve: THREE.CatmullRomCurve3;
  progress: number;
  size: number;
}) {
  const position = curve.getPoint(progress);
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial color="#cbd5e1" emissive="#64748b" emissiveIntensity={0.3} />
    </mesh>
  );
}

function SceneContent({ approach, progress, playing, onProgress }: SceneProps) {
  const missVisual = Math.max(0.25, approach.distanceMinAu * 14);
  const asteroidSize = approach.diameterKm
    ? Math.min(0.14, Math.max(0.04, approach.diameterKm / 800))
    : 0.06;

  const curve = useMemo(() => {
    const ex = EARTH_ORBIT;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-5, 0.2, -9),
      new THREE.Vector3(ex - 2, missVisual * 0.6, -4),
      new THREE.Vector3(ex, missVisual, 0),
      new THREE.Vector3(ex + 2, missVisual * 0.5, 4),
      new THREE.Vector3(7, 0, 9),
    ]);
  }, [missVisual]);

  useFrame((_, delta) => {
    if (playing) {
      const next = Math.min(1, progress + delta * 0.12);
      onProgress(next);
    }
  });

  return (
    <>
      <ambientLight intensity={0.25} />
      <SunMesh />
      <EarthOrbitRing />
      <EarthMesh />
      <AsteroidPath curve={curve} />
      <AsteroidMesh curve={curve} progress={progress} size={asteroidSize} />
      <Stars radius={80} depth={40} count={3000} factor={3} fade speed={0.5} />
      <OrbitControls enablePan={false} minDistance={4} maxDistance={22} />
    </>
  );
}

type AsteroidSceneProps = {
  approach: CloseApproach;
  progress: number;
  playing: boolean;
  onProgress: (value: number) => void;
};

export default function AsteroidScene({
  approach,
  progress,
  playing,
  onProgress,
}: AsteroidSceneProps) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 sm:h-[480px]">
      <Canvas camera={{ position: [6, 5, 10], fov: 50 }}>
        <SceneContent
          approach={approach}
          progress={progress}
          playing={playing}
          onProgress={onProgress}
        />
      </Canvas>
    </div>
  );
}
