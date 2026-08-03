"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { CosmicLocation } from "@/lib/types/space";

type CosmicLocationSceneProps = {
  location: CosmicLocation;
};

function GalaxySpiral() {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const count = 12000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const arm = i % 4;
      const t = Math.random() * Math.PI * 5;
      const r = 0.4 + Math.random() * 9.5;
      const armOffset = (arm / 4) * Math.PI * 2 + t * 0.22;
      const x = Math.cos(armOffset) * r;
      const z = Math.sin(armOffset) * r;
      const y = (Math.random() - 0.5) * 0.35 * (1 - r / 12);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const warmth = 0.55 + (1 - r / 10) * 0.35;
      colors[i * 3] = 0.55 * warmth + 0.2;
      colors[i * 3 + 1] = 0.65 * warmth + 0.15;
      colors[i * 3 + 2] = 0.95;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.015;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial size={0.035} vertexColors transparent opacity={0.85} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function GalacticCore() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.25} />
      </mesh>
      <pointLight intensity={2.5} color="#fff3c4" distance={18} decay={2} />
    </group>
  );
}

function DistantGalaxies() {
  const galaxies = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        pos: [
          (Math.random() - 0.5) * 28,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 28,
        ] as [number, number, number],
        size: 0.08 + Math.random() * 0.18,
        hue: 0.55 + Math.random() * 0.2,
      })),
    [],
  );

  return (
    <group>
      {galaxies.map((g, i) => (
        <mesh key={i} position={g.pos}>
          <sphereGeometry args={[g.size, 8, 8]} />
          <meshBasicMaterial color={new THREE.Color().setHSL(g.hue, 0.35, 0.65)} transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function LocationMarker({
  position,
  label,
  color,
  size = 0.18,
}: {
  position: [number, number, number];
  label: string;
  color: string;
  size?: number;
}) {
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.5) * 0.15;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2.2, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size, 20, 20]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line
        points={[
          [0, 0, 0],
          [0, 0.8, 0],
        ]}
        color={color}
        lineWidth={1.5}
      />
      <Html distanceFactor={14} position={[0, 1.1, 0]} center>
        <div className="max-w-[140px] rounded-lg border border-indigo-400/40 bg-black/85 px-2 py-1 text-center text-[10px] text-indigo-100 shadow-lg">
          {label}
        </div>
      </Html>
    </group>
  );
}

function LocalSolarSystem({ highlightBody }: { highlightBody?: string }) {
  const groupRef = useRef<THREE.Group>(null);

  const bodies = useMemo(
    () => [
      { name: "水星", orbit: 0.55, radius: 0.04, color: "#a8a29e", angle: 0.2 },
      { name: "金星", orbit: 0.75, radius: 0.06, color: "#fcd34d", angle: 1.1 },
      { name: "地球", orbit: 1.0, radius: 0.07, color: "#60a5fa", angle: 2.4 },
      { name: "月", orbit: 1.18, radius: 0.025, color: "#d4d4d4", angle: 2.7, parent: "地球" },
      { name: "火星", orbit: 1.35, radius: 0.05, color: "#f87171", angle: 3.8 },
      { name: "木星", orbit: 1.75, radius: 0.12, color: "#d97706", angle: 5.1 },
      { name: "土星", orbit: 2.1, radius: 0.1, color: "#fbbf24", angle: 0.9, ring: true },
    ],
    [],
  );

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.08;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[0.18, 32, 32]} />
        <meshBasicMaterial color="#fffef0" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.35} />
      </mesh>
      <pointLight intensity={3} color="#fff8e7" distance={8} decay={2} />

      {bodies.map((body) => {
        const x = Math.cos(body.angle) * body.orbit;
        const z = Math.sin(body.angle) * body.orbit;
        const highlighted =
          !highlightBody ||
          body.name === highlightBody ||
          (highlightBody === "月" && body.name === "月");
        return (
          <group key={body.name} position={[x, 0, z]}>
            <mesh>
              <sphereGeometry args={[body.radius, 20, 20]} />
              <meshStandardMaterial
                color={body.color}
                emissive={highlighted ? body.color : "#000000"}
                emissiveIntensity={highlighted ? 0.45 : 0.08}
              />
            </mesh>
            {body.ring && (
              <mesh rotation-x={Math.PI / 2}>
                <ringGeometry args={[body.radius * 1.5, body.radius * 2.1, 32]} />
                <meshBasicMaterial color="#fde68a" transparent opacity={0.45} side={THREE.DoubleSide} />
              </mesh>
            )}
            {highlighted && (
              <Html distanceFactor={8} position={[0, body.radius + 0.12, 0]} center>
                <span className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-amber-100">
                  {body.name}
                </span>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function CosmicSceneContent({ location }: { location: CosmicLocation }) {
  const sunPos = location.sunGalacticPosition;
  const markerPos = location.markerPosition;

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 8, 2]} intensity={0.4} color="#c7d2fe" />

      <GalaxySpiral />
      <GalacticCore />

      {(location.scale === "deep-universe" || location.scale === "local-group") && (
        <DistantGalaxies />
      )}

      <LocationMarker
        position={sunPos}
        label="太陽系（太陽の位置）"
        color="#fbbf24"
        size={0.12}
      />

      {!location.showLocalSystem && (
        <LocationMarker
          position={markerPos}
          label={location.positionLabel}
          color="#818cf8"
          size={0.16}
        />
      )}

      {location.showLocalSystem && (
        <group position={sunPos}>
          <LocalSolarSystem highlightBody={location.localBody} />
        </group>
      )}

      <Line
        points={[sunPos, markerPos]}
        color="#6366f1"
        transparent
        opacity={location.showLocalSystem ? 0 : 0.35}
        dashed
        dashSize={0.2}
        gapSize={0.12}
      />

      <Stars radius={60} depth={30} count={2500} factor={2.5} fade speed={0.2} />
      <OrbitControls enablePan minDistance={4} maxDistance={28} target={location.showLocalSystem ? sunPos : markerPos} />
    </>
  );
}

export default function CosmicLocationScene({ location }: CosmicLocationSceneProps) {
  const sceneKey = `${location.scale}-${location.positionLabel}`;

  return (
    <div className="h-[320px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/70 sm:h-[360px]">
      <Canvas key={sceneKey} camera={{ position: [0, 9, 14], fov: 50 }}>
        <Suspense fallback={null}>
          <CosmicSceneContent location={location} />
        </Suspense>
      </Canvas>
    </div>
  );
}
