"use client";

import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { CosmicLocation, CosmicScale } from "@/lib/types/space";

type CosmicLocationSceneProps = {
  location: CosmicLocation;
  /** 写真切替でシーンを確実に更新するためのキー */
  viewKey?: string;
};

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function GalaxySpiral({ scale = 1 }: { scale?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const random = createRandom(0x5eed1);
    const count = 12000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const arm = i % 4;
      const t = random() * Math.PI * 5;
      const r = 0.4 + random() * 9.5;
      const armOffset = (arm / 4) * Math.PI * 2 + t * 0.22;
      const x = Math.cos(armOffset) * r;
      const z = Math.sin(armOffset) * r;
      const y = (random() - 0.5) * 0.35 * (1 - r / 12);
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
    <group scale={scale}>
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          size={0.035 * Math.max(scale, 0.35)}
          vertexColors
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
}

function GalacticCore({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
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

function DistantGalaxies({ denser = false }: { denser?: boolean }) {
  const galaxies = useMemo(() => {
    const random = createRandom(denser ? 0xb00b : 0x9a1a);
    const count = denser ? 36 : 18;
    return Array.from({ length: count }, () => ({
      pos: [
        (random() - 0.5) * (denser ? 48 : 28),
        (random() - 0.5) * (denser ? 10 : 6),
        (random() - 0.5) * (denser ? 48 : 28),
      ] as [number, number, number],
      size: 0.08 + random() * 0.18,
      hue: 0.55 + random() * 0.2,
    }));
  }, [denser]);

  return (
    <group>
      {galaxies.map((g, i) => (
        <mesh key={i} position={g.pos}>
          <sphereGeometry args={[g.size, 8, 8]} />
          <meshBasicMaterial
            color={new THREE.Color().setHSL(g.hue, 0.35, 0.65)}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

/** ラベルなしの位置マーカー（写真の対象） */
function TargetMarker({
  position,
  color,
  size = 0.18,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
}) {
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.5) * 0.18;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2.4, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size, 20, 20]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line
        points={[
          [0, -0.35, 0],
          [0, 0.9, 0],
        ]}
        color={color}
        lineWidth={1.5}
      />
    </group>
  );
}

/** 太陽位置（ラベルなし・小さな金色マーカー） */
function SunMarker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

/** 銀河外スケール時の天の川の目印 */
function MilkyWayContextBadge({
  position,
  compactScale,
}: {
  position: [number, number, number];
  compactScale: number;
}) {
  return (
    <group position={position}>
      <GalaxySpiral scale={compactScale} />
      <GalacticCore scale={compactScale} />
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[compactScale * 9.2, compactScale * 9.8, 64]} />
        <meshBasicMaterial
          color="#a5b4fc"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html distanceFactor={22} position={[0, compactScale * 3.2, 0]} center>
        <div className="rounded-md border border-sky-300/35 bg-black/80 px-2 py-0.5 text-[9px] tracking-wide text-sky-100">
          天の川銀河
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
      {
        name: "月",
        orbit: 1.18,
        radius: 0.025,
        color: "#d4d4d4",
        angle: 2.7,
      },
      { name: "火星", orbit: 1.35, radius: 0.05, color: "#f87171", angle: 3.8 },
      { name: "木星", orbit: 1.75, radius: 0.12, color: "#d97706", angle: 5.1 },
      {
        name: "土星",
        orbit: 2.1,
        radius: 0.1,
        color: "#fbbf24",
        angle: 0.9,
        ring: true,
      },
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
        const highlighted = Boolean(highlightBody) && body.name === highlightBody;
        return (
          <group key={body.name} position={[x, 0, z]}>
            <mesh>
              <sphereGeometry args={[body.radius, 20, 20]} />
              <meshStandardMaterial
                color={body.color}
                emissive={highlighted ? body.color : "#000000"}
                emissiveIntensity={highlighted ? 0.55 : 0.08}
              />
            </mesh>
            {body.ring && (
              <mesh rotation-x={Math.PI / 2}>
                <ringGeometry
                  args={[body.radius * 1.5, body.radius * 2.1, 32]}
                />
                <meshBasicMaterial
                  color="#fde68a"
                  transparent
                  opacity={0.45}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function cameraConfig(scale: CosmicScale, sunPos: [number, number, number], markerPos: [number, number, number]) {
  if (scale === "solar-system") {
    return {
      position: [sunPos[0] + 2.2, 2.4, sunPos[2] + 3.4] as [number, number, number],
      target: sunPos,
      minDistance: 1.5,
      maxDistance: 10,
    };
  }
  if (scale === "milky-way") {
    const mid: [number, number, number] = [
      (sunPos[0] + markerPos[0]) / 2,
      Math.max(markerPos[1], 0.5) + 1,
      (sunPos[2] + markerPos[2]) / 2,
    ];
    return {
      position: [mid[0] + 4, 8, mid[2] + 11] as [number, number, number],
      target: markerPos,
      minDistance: 4,
      maxDistance: 24,
    };
  }
  if (scale === "local-group") {
    return {
      position: [markerPos[0] * 0.25, 16, 26] as [number, number, number],
      target: [
        markerPos[0] * 0.35,
        0,
        markerPos[2] * 0.35,
      ] as [number, number, number],
      minDistance: 8,
      maxDistance: 42,
    };
  }
  return {
    position: [markerPos[0] * 0.15, 22, 34] as [number, number, number],
    target: [
      markerPos[0] * 0.25,
      0,
      markerPos[2] * 0.25,
    ] as [number, number, number],
    minDistance: 10,
    maxDistance: 58,
  };
}

function CameraSetup({
  scale,
  sunPos,
  markerPos,
}: {
  scale: CosmicScale;
  sunPos: [number, number, number];
  markerPos: [number, number, number];
}) {
  const { camera } = useThree();
  const controlsRef = useRef<{
    target: THREE.Vector3;
    update: () => void;
  } | null>(null);
  const cfg = useMemo(
    () => cameraConfig(scale, sunPos, markerPos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scale, sunPos.join(","), markerPos.join(",")],
  );

  useLayoutEffect(() => {
    camera.position.set(...cfg.position);
    camera.lookAt(...cfg.target);
    camera.updateProjectionMatrix();
    controlsRef.current?.target.set(...cfg.target);
    controlsRef.current?.update();
  }, [camera, cfg]);

  return (
    <OrbitControls
      ref={controlsRef as never}
      enablePan
      minDistance={cfg.minDistance}
      maxDistance={cfg.maxDistance}
      target={cfg.target}
    />
  );
}

function CosmicSceneContent({ location }: { location: CosmicLocation }) {
  const sunPos = location.sunGalacticPosition;
  const markerPos = location.markerPosition;
  const outside = location.showMilkyWayContext;
  const compact = location.scale === "deep-universe" ? 0.22 : 0.32;

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 8, 2]} intensity={0.4} color="#c7d2fe" />

      {/* 銀河内スケール: 通常サイズの天の川 */}
      {!outside && (
        <>
          <GalaxySpiral />
          <GalacticCore />
          <SunMarker position={sunPos} />
        </>
      )}

      {/* 銀河外: 縮小した天の川を残し、どこが銀河か分かるようにする */}
      {outside && (
        <MilkyWayContextBadge position={[0, 0, 0]} compactScale={compact} />
      )}

      {(location.scale === "deep-universe" ||
        location.scale === "local-group") && (
        <DistantGalaxies denser={location.scale === "deep-universe"} />
      )}

      {!location.showLocalSystem && (
        <TargetMarker position={markerPos} color="#818cf8" size={outside ? 0.28 : 0.16} />
      )}

      {location.showLocalSystem && (
        <group position={sunPos}>
          <LocalSolarSystem highlightBody={location.localBody} />
        </group>
      )}

      {/* 太陽（地球側）から写真の対象への視線 */}
      {!location.showLocalSystem && (
        <Line
          points={[outside ? ([0, 0, 0] as [number, number, number]) : sunPos, markerPos]}
          color="#6366f1"
          transparent
          opacity={0.4}
          dashed
          dashSize={0.25}
          gapSize={0.14}
        />
      )}

      <Stars
        radius={outside ? 90 : 60}
        depth={40}
        count={outside ? 3200 : 2500}
        factor={2.5}
        fade
        speed={0.2}
      />

      <CameraSetup
        scale={location.scale}
        sunPos={sunPos}
        markerPos={markerPos}
      />
    </>
  );
}

export default function CosmicLocationScene({
  location,
  viewKey,
}: CosmicLocationSceneProps) {
  const sceneKey =
    viewKey ??
    `${location.scale}-${location.targetLabel}-${location.markerPosition.join(",")}`;

  const initial = cameraConfig(
    location.scale,
    location.sunGalacticPosition,
    location.markerPosition,
  );

  return (
    <div className="h-[320px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/70 sm:h-[360px]">
      <Canvas key={sceneKey} camera={{ position: initial.position, fov: 50 }}>
        <Suspense fallback={null}>
          <CosmicSceneContent location={location} />
        </Suspense>
      </Canvas>
    </div>
  );
}
