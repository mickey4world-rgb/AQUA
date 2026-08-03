"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Html, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { CloseApproach } from "@/lib/types/space";
import {
  EARTH_ORBIT,
  SUN_RADIUS,
  buildAsteroidOrbit,
  earthPosition,
  orbitPhaseLabel,
} from "@/lib/space-orbit";

const EARTH_RADIUS = 0.22;
const EARTH_TEXTURE =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg";
const EARTH_SPECULAR =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_specular_2048.jpg";
const EARTH_CLOUDS =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_clouds_1024.png";

type SceneProps = {
  approach: CloseApproach;
  progress: number;
  playing: boolean;
  onProgress: (value: number) => void;
};

function SunMesh() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#ffe066" />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.18, 48, 48]} />
        <meshBasicMaterial color="#ff9933" transparent opacity={0.22} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.55, 32, 32]} />
        <meshBasicMaterial color="#ff6600" transparent opacity={0.07} />
      </mesh>
      <pointLight intensity={5} color="#fff8e7" distance={120} decay={2} />
      <pointLight intensity={1.5} color="#ffaa44" distance={60} decay={2} />
    </group>
  );
}

function EarthOrbitRing() {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([Math.cos(a) * EARTH_ORBIT, 0, Math.sin(a) * EARTH_ORBIT]);
    }
    return pts;
  }, []);

  return <Line points={points} color="#475569" transparent opacity={0.45} lineWidth={1} />;
}

function EarthMesh({ initialAngle }: { initialAngle: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const angleRef = useRef(initialAngle);

  const [map, specular, clouds] = useTexture([EARTH_TEXTURE, EARTH_SPECULAR, EARTH_CLOUDS]);

  useFrame((_, delta) => {
    angleRef.current += delta * 0.05;
    if (groupRef.current) {
      const pos = earthPosition(angleRef.current);
      groupRef.current.position.copy(pos);
    }
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.35;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.42;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshPhongMaterial
          map={map}
          specularMap={specular}
          specular={new THREE.Color("#333333")}
          shininess={18}
        />
      </mesh>
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[EARTH_RADIUS * 1.015, 64, 64]} />
        <meshPhongMaterial
          map={clouds}
          transparent
          opacity={0.38}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.08, 32, 32]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

function AsteroidPath({ points, color }: { points: [number, number, number][]; color: string }) {
  return (
    <Line points={points} color={color} transparent opacity={0.9} lineWidth={2} dashed dashSize={0.15} gapSize={0.08} />
  );
}

function ClosestMarker({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.12, 0.18, 32]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function AsteroidMesh({
  curve,
  progress,
  size,
  seed,
  designation,
  distanceLd,
  phase,
}: {
  curve: THREE.CatmullRomCurve3;
  progress: number;
  size: number;
  seed: number;
  designation: string;
  distanceLd: number;
  phase: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const position = curve.getPoint(progress);
  const nearClosest = Math.abs(progress - 0.5) < 0.08;

  const scale = useMemo(() => {
    const sx = 1 + ((seed % 30) / 100);
    const sy = 0.85 + ((seed >> 4) % 25) / 100;
    const sz = 0.9 + ((seed >> 8) % 20) / 100;
    return new THREE.Vector3(sx, sy, sz);
  }, [seed]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 1.6;
      meshRef.current.rotation.y += delta * 2.1;
    }
    if (glowRef.current) {
      const pulse = nearClosest ? 1.25 + Math.sin(Date.now() * 0.008) * 0.15 : 1;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef} scale={scale}>
        <dodecahedronGeometry args={[size, 0]} />
        <meshStandardMaterial
          color={nearClosest ? "#fcd34d" : "#a8a29e"}
          emissive={nearClosest ? "#f97316" : "#44403c"}
          emissiveIntensity={nearClosest ? 0.55 : 0.15}
          roughness={0.92}
          metalness={0.08}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 1.8, 16, 16]} />
        <meshBasicMaterial color="#f97316" transparent opacity={nearClosest ? 0.18 : 0.05} />
      </mesh>
      <Html distanceFactor={10} position={[0, size + 0.35, 0]} center>
        <div className="whitespace-nowrap rounded-lg border border-orange-400/40 bg-black/80 px-2 py-1 text-[10px] text-orange-100 shadow-lg">
          <p className="font-semibold">{designation}</p>
          <p>{phase}</p>
          <p>{distanceLd.toFixed(2)} LD</p>
        </div>
      </Html>
    </group>
  );
}

function SceneContent({ approach, progress, playing, onProgress }: SceneProps) {
  const orbit = useMemo(() => buildAsteroidOrbit(approach), [approach]);
  const pathPoints = useMemo(
    () => orbit.curve.getPoints(100).map((p) => [p.x, p.y, p.z] as [number, number, number]),
    [orbit.curve],
  );
  const seed = useMemo(
    () => approach.designation.length * 17 + approach.closeApproachDate.length * 31,
    [approach],
  );
  const phase = orbitPhaseLabel(progress, orbit.closestProgress);

  useFrame((_, delta) => {
    if (playing) {
      const next = Math.min(1, progress + delta * orbit.animationSpeed);
      onProgress(next);
    }
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[8, 6, 4]} intensity={0.35} color="#dbeafe" />
      <SunMesh />
      <EarthOrbitRing />
      <EarthMesh initialAngle={orbit.earthAngle} />
      <AsteroidPath points={pathPoints} color="#fb923c" />
      <ClosestMarker position={orbit.closestPoint} />
      <AsteroidMesh
        curve={orbit.curve}
        progress={progress}
        size={orbit.asteroidSize}
        seed={seed}
        designation={approach.designation}
        distanceLd={approach.distanceMinLd}
        phase={phase}
      />
      <Stars radius={90} depth={45} count={4000} factor={3.5} fade speed={0.35} />
      <OrbitControls enablePan={false} minDistance={5} maxDistance={24} />
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
  const sceneKey = `${approach.designation}-${approach.closeApproachDate}`;

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 sm:h-[480px]">
      <Canvas key={sceneKey} camera={{ position: [7, 6, 11], fov: 48 }}>
        <Suspense fallback={null}>
          <SceneContent
            approach={approach}
            progress={progress}
            playing={playing}
            onProgress={onProgress}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
