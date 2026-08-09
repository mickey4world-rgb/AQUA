"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Line,
  Html,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import type { CloseApproach } from "@/lib/types/space";
import {
  EARTH_ORBIT,
  JUPITER_ORBIT,
  MARS_ORBIT,
  MERCURY_ORBIT,
  MOON_ORBIT,
  PLANET_PERIOD_YEARS,
  SATURN_ORBIT,
  SUN_RADIUS,
  VENUS_ORBIT,
  angleAfterDays,
  buildAsteroidOrbit,
  dayOffsetForProgress,
  earthPosition,
  orbitPhaseLabel,
  planetPosition,
} from "@/lib/space-orbit";

const EARTH_RADIUS = 0.22;
const EARTH_TEXTURE =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg";
const EARTH_SPECULAR =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_specular_2048.jpg";
const EARTH_CLOUDS =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_clouds_1024.png";
const MOON_START_ANGLE = Math.PI * 0.35;

type SceneProps = {
  approach: CloseApproach;
  progress: number;
  playing: boolean;
  onProgress: (value: number) => void;
};

function SunMesh() {
  const coreRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = 1 + Math.sin(t * 4.2) * 0.05 + Math.sin(t * 9.1) * 0.025;
    if (coreRef.current) coreRef.current.scale.setScalar(flicker);
    if (coronaRef.current) {
      coronaRef.current.scale.setScalar(1.05 + Math.sin(t * 2.8) * 0.08);
    }
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#fffef5" />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.12, 48, 48]} />
        <meshBasicMaterial color="#fff4a8" transparent opacity={0.55} />
      </mesh>
      <mesh ref={coronaRef}>
        <sphereGeometry args={[SUN_RADIUS * 1.35, 48, 48]} />
        <meshBasicMaterial color="#ff9933" transparent opacity={0.32} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.85, 32, 32]} />
        <meshBasicMaterial color="#ff5500" transparent opacity={0.14} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 2.4, 24, 24]} />
        <meshBasicMaterial color="#ff2200" transparent opacity={0.06} />
      </mesh>
      <pointLight intensity={14} color="#fffef0" distance={140} decay={1.8} />
      <pointLight intensity={5} color="#ffd080" distance={70} decay={2} />
      <pointLight intensity={2.5} color="#ff7722" distance={35} decay={2} />
    </group>
  );
}

function OrbitRing({
  radius,
  color = "#475569",
  opacity = 0.35,
}: {
  radius: number;
  color?: string;
  opacity?: number;
}) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
    }
    return pts;
  }, [radius]);

  return (
    <Line
      points={points}
      color={color}
      transparent
      opacity={opacity}
      lineWidth={1}
    />
  );
}

function MoonMesh() {
  const moonRef = useRef<THREE.Group>(null);
  // 開始位置は見た目の都合だけなので固定値にしておく（描画のたびに変わると困る）
  const angleRef = useRef(MOON_START_ANGLE);

  useFrame((_, delta) => {
    angleRef.current += delta * 0.9;
    if (moonRef.current) {
      moonRef.current.position.set(
        Math.cos(angleRef.current) * MOON_ORBIT,
        0,
        Math.sin(angleRef.current) * MOON_ORBIT,
      );
    }
  });

  return (
    <group ref={moonRef}>
      <mesh>
        <sphereGeometry args={[0.06, 24, 24]} />
        <meshStandardMaterial
          color="#d4d4d8"
          emissive="#888888"
          emissiveIntensity={0.25}
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}

function EarthMesh({
  angle,
}: {
  angle: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);

  const [map, specular, clouds] = useTexture([
    EARTH_TEXTURE,
    EARTH_SPECULAR,
    EARTH_CLOUDS,
  ]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.position.copy(earthPosition(angle));
    }
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.35;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.42;
  });

  return (
    <group ref={groupRef} position={earthPosition(angle)}>
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshPhongMaterial
          map={map}
          specularMap={specular}
          specular={new THREE.Color("#666666")}
          shininess={28}
          emissive="#1e40af"
          emissiveIntensity={0.22}
        />
      </mesh>
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[EARTH_RADIUS * 1.015, 64, 64]} />
        <meshPhongMaterial
          map={clouds}
          transparent
          opacity={0.48}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.1, 32, 32]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.22} />
      </mesh>
      <MoonMesh />
    </group>
  );
}

type PlanetSpec = {
  id: string;
  label: string;
  orbit: number;
  radius: number;
  color: string;
  emissive: string;
  speedKey: string;
  ring?: boolean;
};

const PLANETS: PlanetSpec[] = [
  {
    id: "mercury",
    label: "水星",
    orbit: MERCURY_ORBIT,
    radius: 0.07,
    color: "#a8a29e",
    emissive: "#57534e",
    speedKey: "mercury",
  },
  {
    id: "venus",
    label: "金星",
    orbit: VENUS_ORBIT,
    radius: 0.1,
    color: "#fde68a",
    emissive: "#ca8a04",
    speedKey: "venus",
  },
  {
    id: "mars",
    label: "火星",
    orbit: MARS_ORBIT,
    radius: 0.11,
    color: "#f87171",
    emissive: "#b91c1c",
    speedKey: "mars",
  },
  {
    id: "jupiter",
    label: "木星",
    orbit: JUPITER_ORBIT,
    radius: 0.28,
    color: "#d97706",
    emissive: "#92400e",
    speedKey: "jupiter",
  },
  {
    id: "saturn",
    label: "土星",
    orbit: SATURN_ORBIT,
    radius: 0.24,
    color: "#fcd34d",
    emissive: "#a16207",
    speedKey: "saturn",
    ring: true,
  },
];

function PlanetMesh({
  planet,
  angle,
}: {
  planet: PlanetSpec;
  angle: number;
}) {
  const pos = planetPosition(angle, planet.orbit);

  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[planet.radius, 32, 32]} />
        <meshStandardMaterial
          color={planet.color}
          emissive={planet.emissive}
          emissiveIntensity={0.28}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      {planet.ring && (
        <mesh rotation-x={Math.PI / 2}>
          <ringGeometry
            args={[planet.radius * 1.45, planet.radius * 2.05, 48]}
          />
          <meshBasicMaterial
            color="#fde68a"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <Html distanceFactor={14} position={[0, planet.radius + 0.2, 0]} center>
        <span className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-slate-200">
          {planet.label}
        </span>
      </Html>
    </group>
  );
}

function AsteroidPath({
  points,
  color,
}: {
  points: [number, number, number][];
  color: string;
}) {
  return (
    <Line
      points={points}
      color={color}
      transparent
      opacity={0.9}
      lineWidth={2}
      dashed
      dashSize={0.15}
      gapSize={0.08}
    />
  );
}

function ClosestMarker({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.12, 0.18, 32]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
        />
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
    const sx = 1 + (seed % 30) / 100;
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
      const pulse = nearClosest
        ? 1.25 + Math.sin(Date.now() * 0.008) * 0.15
        : 1;
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
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={nearClosest ? 0.18 : 0.05}
        />
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
  const dayOffset = dayOffsetForProgress(progress, orbit.animationSpanDays);

  const earthAngle = angleAfterDays(orbit.earthAngle, dayOffset, 1);
  const planetAngles = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [id, base] of Object.entries(orbit.planetAngles)) {
      const period = PLANET_PERIOD_YEARS[id] ?? 1;
      next[id] = angleAfterDays(base, dayOffset, period);
    }
    return next;
  }, [orbit.planetAngles, dayOffset]);

  // 小惑星軌道は最接近時の地球位置基準。現在の地球位置へオフセットして追従させる。
  const pathOffset = useMemo(() => {
    const closest = earthPosition(orbit.earthAngle);
    const now = earthPosition(earthAngle);
    return now.clone().sub(closest);
  }, [orbit.earthAngle, earthAngle]);

  const pathPoints = useMemo(
    () =>
      orbit.curve
        .getPoints(100)
        .map(
          (p) =>
            [
              p.x + pathOffset.x,
              p.y + pathOffset.y,
              p.z + pathOffset.z,
            ] as [number, number, number],
        ),
    [orbit.curve, pathOffset],
  );

  const closestPoint = useMemo(
    () => orbit.closestPoint.clone().add(pathOffset),
    [orbit.closestPoint, pathOffset],
  );

  const shiftedCurve = useMemo(() => {
    const pts = orbit.curve.getPoints(64).map((p) => p.clone().add(pathOffset));
    return new THREE.CatmullRomCurve3(pts);
  }, [orbit.curve, pathOffset]);

  const seed = useMemo(
    () =>
      approach.designation.length * 17 + approach.closeApproachDate.length * 31,
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
      <ambientLight intensity={0.22} color="#1e293b" />
      <directionalLight
        position={[-6, 3, -4]}
        intensity={0.9}
        color="#fff4e0"
      />
      <SunMesh />
      <OrbitRing radius={EARTH_ORBIT} />
      <OrbitRing radius={MARS_ORBIT} color="#334155" opacity={0.22} />
      <OrbitRing radius={JUPITER_ORBIT} color="#334155" opacity={0.18} />
      <EarthMesh angle={earthAngle} />
      {PLANETS.map((planet) => (
        <PlanetMesh
          key={planet.id}
          planet={planet}
          angle={planetAngles[planet.id] ?? 0}
        />
      ))}
      <AsteroidPath points={pathPoints} color="#fb923c" />
      <ClosestMarker position={closestPoint} />
      <AsteroidMesh
        curve={shiftedCurve}
        progress={progress}
        size={orbit.asteroidSize}
        seed={seed}
        designation={approach.designation}
        distanceLd={approach.distanceMinLd}
        phase={phase}
      />
      <Stars
        radius={90}
        depth={45}
        count={4000}
        factor={3.5}
        fade
        speed={0.35}
      />
      <OrbitControls enablePan={false} minDistance={5} maxDistance={28} />
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
