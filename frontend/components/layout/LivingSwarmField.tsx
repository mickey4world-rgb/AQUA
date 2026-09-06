"use client";

import { useEffect, useRef } from "react";

type LivingSwarmFieldProps = {
  moteCount: number;
  bubbleCount: number;
};

type LifePhase = "birth" | "gather" | "swim" | "split" | "burst";

type SoftBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  targetSize: number;
  alpha: number;
  phase: number;
  joined: boolean;
  birthDelay: number;
  /** 追随する集合核（0 / 1） */
  hubIndex: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
};

type Hub = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
};

type Creature = {
  kind: "light" | "bubble";
  phase: LifePhase;
  phaseUntil: number;
  phaseStarted: number;
  /** 代表位置（描画・単一集合時）。split 時は hubs[0] と同期 */
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  hubs: Hub[];
  bodies: SoftBody[];
  glow: number;
  softness: number;
  intensity: number;
  flash: number;
  sparks: Spark[];
  dash: number;
  /** 泳ぎの速さ倍率（サイクルごとに変える） */
  tempo: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function softRand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function makeLightBodies(w: number, h: number, count: number): SoftBody[] {
  const bodies: SoftBody[] = [];
  for (let i = 0; i < count; i += 1) {
    // 開始時から広い範囲にはじける
    const x = softRand(i * 3.1 + 1) * w;
    const y = softRand(i * 5.7 + 2) * h * 0.92;
    const size = 1.8 + softRand(i * 2.2) * 2.2;
    bodies.push({
      x,
      y,
      vx: (softRand(i * 1.9) - 0.5) * 1.8,
      vy: (softRand(i * 2.4) - 0.5) * 1.4,
      size: size * 0.35,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 9.1) * Math.PI * 2,
      joined: false,
      birthDelay: softRand(i * 4.3) * 1600,
      hubIndex: 0,
    });
  }
  return bodies;
}

function makeBubbleBodies(w: number, h: number, count: number): SoftBody[] {
  const bodies: SoftBody[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = softRand(i * 4.4 + 8) * w * 0.92 + w * 0.04;
    const y = h * (0.88 + softRand(i * 1.7) * 0.12);
    const size = 8 + softRand(i * 6.3) * 18;
    bodies.push({
      x,
      y,
      vx: (softRand(i * 2.9) - 0.5) * 0.25,
      vy: -0.18 - softRand(i) * 0.16,
      size: size * 0.35,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 7.7) * Math.PI * 2,
      joined: false,
      birthDelay: softRand(i * 3.8) * 900,
      hubIndex: 0,
    });
  }
  return bodies;
}

function spawnSparks(c: Creature, wide = false): Spark[] {
  const sparks: Spark[] = [];
  const hubs = c.hubs.length > 0 ? c.hubs : [{ x: c.x, y: c.y }];
  const n = wide
    ? Math.min(72, 28 + c.bodies.length * 2)
    : Math.min(40, 16 + c.bodies.length * 2);
  for (let i = 0; i < n; i += 1) {
    const hub = hubs[i % hubs.length];
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.55;
    const speed = (wide ? 3.2 : 1.4) + Math.random() * (wide ? 6.4 : 3.4);
    sparks.push({
      x: hub.x + (Math.random() - 0.5) * (wide ? 120 : 36),
      y: hub.y + (Math.random() - 0.5) * (wide ? 90 : 28),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - (wide ? 0.2 : 0.6),
      life: 1,
      maxLife: (wide ? 1.05 : 0.7) + Math.random() * (wide ? 1.0 : 0.7),
      size: 1 + Math.random() * (wide ? 2.8 : 2.2),
    });
  }
  return sparks;
}

function flingBodies(c: Creature, wide: boolean) {
  for (const b of c.bodies) {
    const ang = Math.random() * Math.PI * 2;
    const speed = (wide ? 3.6 : 1.1) + Math.random() * (wide ? 7.5 : 2.8);
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed * (wide ? 0.9 : 1);
    b.joined = false;
    b.targetSize = Math.max(1.4, b.targetSize * (wide ? 0.7 : 1));
  }
}

function createCreatures(
  w: number,
  h: number,
  moteCount: number,
  bubbleCount: number,
): Creature[] {
  const now = performance.now();
  const lightX = w * 0.5;
  const lightY = h * 0.36;
  return [
    {
      kind: "light",
      phase: "birth",
      phaseUntil: now + 4200,
      phaseStarted: now,
      x: lightX,
      y: lightY,
      vx: 0.2,
      vy: 0.05,
      heading: -0.4,
      hubs: [{ x: lightX, y: lightY, vx: 0.2, vy: 0.05, heading: -0.4 }],
      bodies: makeLightBodies(w, h, moteCount),
      glow: 0,
      softness: 0,
      intensity: 0,
      flash: 0,
      sparks: [],
      dash: 0,
      tempo: 1.15,
    },
    {
      kind: "bubble",
      phase: "birth",
      phaseUntil: now + 3000,
      phaseStarted: now,
      x: w * 0.5,
      y: h * 0.9,
      vx: 0.1,
      vy: -0.14,
      heading: 0.25,
      hubs: [{ x: w * 0.5, y: h * 0.9, vx: 0.1, vy: -0.14, heading: 0.25 }],
      bodies: makeBubbleBodies(w, h, bubbleCount),
      glow: 0,
      softness: 0,
      intensity: 0.5,
      flash: 0,
      sparks: [],
      dash: 0,
      tempo: 1,
    },
  ];
}

/**
 * 光: 広い出生 → 集合 → 高速スイム（時々2分裂）→ 大破裂 → ぼんやり再集合
 * 泡: 自然上昇・割れ
 */
export default function LivingSwarmField({
  moteCount,
  bubbleCount,
}: LivingSwarmFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let creatures: Creature[] = [];
    let lastFrame = 0;
    const frameMs = 33;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creatures = createCreatures(w, h, moteCount, bubbleCount);
    };

    const syncPrimary = (c: Creature) => {
      const hub = c.hubs[0];
      if (!hub) return;
      c.x = hub.x;
      c.y = hub.y;
      c.vx = hub.vx;
      c.vy = hub.vy;
      c.heading = hub.heading;
    };

    const beginSplit = (c: Creature, now: number) => {
      const a = c.hubs[0] ?? {
        x: c.x,
        y: c.y,
        vx: c.vx,
        vy: c.vy,
        heading: c.heading,
      };
      const side = Math.random() > 0.5 ? 1 : -1;
      c.hubs = [
        {
          x: a.x,
          y: a.y,
          vx: a.vx,
          vy: a.vy,
          heading: a.heading + side * 0.35,
        },
        {
          x: clamp(a.x + side * w * 0.18, w * 0.08, w * 0.92),
          y: clamp(a.y + (Math.random() - 0.5) * h * 0.2, h * 0.08, h * 0.88),
          vx: -a.vx * 0.8,
          vy: a.vy * 0.6 + side * 0.2,
          heading: a.heading + Math.PI * (0.55 + Math.random() * 0.35),
        },
      ];
      for (let i = 0; i < c.bodies.length; i += 1) {
        c.bodies[i].hubIndex = i % 2;
        c.bodies[i].joined = false;
      }
      c.phase = "split";
      c.phaseStarted = now;
      c.phaseUntil = now + 6500 + Math.random() * 4500;
      c.tempo = 0.95 + Math.random() * 0.55;
      syncPrimary(c);
    };

    const endSplitMerge = (c: Creature, now: number) => {
      const hx = (c.hubs[0]?.x ?? c.x) * 0.55 + (c.hubs[1]?.x ?? c.x) * 0.45;
      const hy = (c.hubs[0]?.y ?? c.y) * 0.55 + (c.hubs[1]?.y ?? c.y) * 0.45;
      c.hubs = [
        {
          x: hx,
          y: hy,
          vx: ((c.hubs[0]?.vx ?? 0) + (c.hubs[1]?.vx ?? 0)) * 0.35,
          vy: ((c.hubs[0]?.vy ?? 0) + (c.hubs[1]?.vy ?? 0)) * 0.35,
          heading: Math.random() * Math.PI * 2,
        },
      ];
      for (const b of c.bodies) b.hubIndex = 0;
      c.phase = "gather";
      c.phaseStarted = now;
      c.phaseUntil = now + 5200;
      c.softness = 0.85;
      c.intensity = 0.28;
      syncPrimary(c);
    };

    const respawnCreature = (c: Creature, now: number) => {
      c.phase = "birth";
      c.phaseStarted = now;
      c.phaseUntil = now + (c.kind === "bubble" ? 3000 : 4500);
      c.glow = 0;
      c.softness = 0;
      c.intensity = 0;
      c.flash = 0;
      c.dash = 0;
      c.sparks = [];
      c.tempo = 0.9 + Math.random() * 0.7;
      c.heading = Math.random() * Math.PI * 2;
      if (c.kind === "light") {
        c.x = w * (0.15 + Math.random() * 0.7);
        c.y = h * (0.12 + Math.random() * 0.55);
        c.vx = Math.cos(c.heading) * 0.18;
        c.vy = Math.sin(c.heading) * 0.12;
        c.bodies = makeLightBodies(w, h, c.bodies.length);
        c.hubs = [{ x: c.x, y: c.y, vx: c.vx, vy: c.vy, heading: c.heading }];
      } else {
        c.x = w * (0.18 + Math.random() * 0.64);
        c.y = h * 0.94;
        c.vx = Math.cos(c.heading) * 0.1;
        c.vy = -0.16;
        c.bodies = makeBubbleBodies(w, h, c.bodies.length);
        c.hubs = [{ x: c.x, y: c.y, vx: c.vx, vy: c.vy, heading: c.heading }];
        c.intensity = 0.45;
      }
    };

    const advancePhase = (c: Creature, now: number) => {
      if (now < c.phaseUntil) return;
      if (c.phase === "birth") {
        c.phase = "gather";
        c.phaseStarted = now;
        c.phaseUntil = now + 4200;
      } else if (c.phase === "gather") {
        c.phase = "swim";
        c.phaseStarted = now;
        c.phaseUntil = now + (c.kind === "bubble" ? 9000 : 7500 + Math.random() * 5000);
        c.dash = c.kind === "light" ? 1 : 0;
        c.tempo = 0.85 + Math.random() * 0.9;
        const hub = c.hubs[0];
        if (hub) {
          hub.heading = c.heading;
          hub.vx = Math.cos(hub.heading) * (c.kind === "bubble" ? 0.22 : 0.75 * c.tempo);
          hub.vy = Math.sin(hub.heading) * (c.kind === "bubble" ? 0.12 : 0.48 * c.tempo);
        }
        syncPrimary(c);
      } else if (c.phase === "swim") {
        if (c.kind === "light" && Math.random() < 0.42) {
          beginSplit(c, now);
        } else {
          c.phase = "burst";
          c.phaseStarted = now;
          c.phaseUntil = now + (c.kind === "light" ? 2200 : 1600);
          c.sparks = spawnSparks(c, true);
          c.flash = c.kind === "light" ? 1 : 0.85;
          c.dash = 0;
          flingBodies(c, true);
        }
      } else if (c.phase === "split") {
        if (Math.random() < 0.55) {
          endSplitMerge(c, now);
        } else {
          c.phase = "burst";
          c.phaseStarted = now;
          c.phaseUntil = now + 2400;
          c.sparks = spawnSparks(c, true);
          c.flash = 1;
          flingBodies(c, true);
        }
      } else if (c.phase === "burst" && c.kind === "light") {
        c.phase = "gather";
        c.phaseStarted = now;
        c.phaseUntil = now + 5600;
        c.softness = 0.92;
        c.intensity = 0.22;
        c.glow = 0.08;
        c.heading = Math.random() * Math.PI * 2;
        c.x = clamp(c.x + (Math.random() - 0.5) * w * 0.28, w * 0.1, w * 0.9);
        c.y = clamp(c.y + (Math.random() - 0.5) * h * 0.22, h * 0.1, h * 0.82);
        c.hubs = [{ x: c.x, y: c.y, vx: 0, vy: 0, heading: c.heading }];
        for (const b of c.bodies) {
          b.birthDelay = 0;
          b.hubIndex = 0;
          b.targetSize = 1.6 + Math.random() * 2.4;
        }
      } else {
        respawnCreature(c, now);
      }
    };

    const steerHub = (hub: Hub, c: Creature, now: number, age: number) => {
      const sec = now * 0.001;
      const tempo = c.tempo;
      if (c.kind === "light" && (c.phase === "swim" || c.phase === "split")) {
        const dart =
          Math.sin(sec * 2.1 * tempo + hub.x * 0.006) * 0.06 +
          Math.sin(sec * 0.7 + age * 0.0012) * 0.035;
        hub.heading += dart;
        if (Math.sin(sec * 1.1 + hub.y * 0.012) > 0.88) {
          hub.heading += (Math.sin(sec * 4.2) > 0 ? 1 : -1) * 0.18;
        }
        const speed =
          (0.55 + 0.55 * Math.abs(Math.sin(sec * 1.35 * tempo + age * 0.0009))) * tempo;
        const targetVx = Math.cos(hub.heading) * speed;
        const targetVy = Math.sin(hub.heading) * speed * 0.85;
        hub.vx += (targetVx - hub.vx) * 0.07;
        hub.vy += (targetVy - hub.vy) * 0.07;
        hub.x += hub.vx;
        hub.y += hub.vy;
      } else if (c.phase === "swim" || c.phase === "gather") {
        hub.heading += Math.sin(sec * 0.33 + hub.x * 0.001) * 0.008;
        const speed =
          c.kind === "bubble" ? 0.28 : c.phase === "gather" ? 0.12 : 0.28 * tempo;
        const targetVx = Math.cos(hub.heading) * speed;
        const targetVy =
          c.kind === "bubble"
            ? -0.22 + Math.sin(sec * 0.35) * 0.06
            : Math.sin(hub.heading) * speed * 0.55;
        hub.vx += (targetVx - hub.vx) * 0.03;
        hub.vy += (targetVy - hub.vy) * 0.03;
        hub.x += hub.vx;
        hub.y += hub.vy;
      }

      if (c.kind === "light") {
        if (hub.x < w * 0.04) hub.heading = 0.1 + Math.random() * 0.5;
        if (hub.x > w * 0.96) hub.heading = Math.PI - 0.1 - Math.random() * 0.5;
        if (hub.y < h * 0.04) hub.heading = 0.7 + Math.random() * 0.7;
        if (hub.y > h * 0.92) hub.heading = -0.7 - Math.random() * 0.7;
        hub.x = clamp(hub.x, w * 0.03, w * 0.97);
        hub.y = clamp(hub.y, h * 0.04, h * 0.94);
      } else {
        if (hub.x < w * 0.1) hub.heading = 0.25;
        if (hub.x > w * 0.9) hub.heading = Math.PI - 0.25;
        hub.x = clamp(hub.x, w * 0.08, w * 0.92);
        hub.y = clamp(hub.y, h * 0.08, h * 0.94);
      }
    };

    const steerCreature = (c: Creature, now: number) => {
      const age = now - c.phaseStarted;
      if (c.kind === "light" && c.phase === "burst") {
        for (const hub of c.hubs) {
          hub.vx *= 0.94;
          hub.vy *= 0.94;
          hub.x += hub.vx * 0.35;
          hub.y += hub.vy * 0.35;
        }
        syncPrimary(c);
        return;
      }
      for (const hub of c.hubs) {
        steerHub(hub, c, now, age);
      }
      if (c.kind === "light" && (c.phase === "swim" || c.phase === "split")) {
        c.dash =
          0.55 +
          0.45 *
            Math.min(
              1,
              Math.hypot(c.hubs[0]?.vx ?? 0, c.hubs[0]?.vy ?? 0) / (0.85 * c.tempo),
            );
      }
      syncPrimary(c);
    };

    const stepBodies = (c: Creature, now: number) => {
      const age = now - c.phaseStarted;
      const gatherT = clamp(age / 5600, 0, 1);
      const gatherStrength =
        c.phase === "gather"
          ? 0.016 + gatherT * 0.048
          : c.phase === "swim" || c.phase === "split"
            ? 0.055
            : 0.01;
      let joined = 0;

      if (c.kind === "light") {
        if (c.phase === "birth") {
          const t = clamp(age / 4200, 0, 1);
          c.intensity += (0.15 + t * 0.7 - c.intensity) * 0.03;
          c.softness += ((t > 0.5 ? (t - 0.5) * 1.5 : 0) - c.softness) * 0.04;
        } else if (c.phase === "gather") {
          c.intensity += (0.28 + gatherT * 0.58 - c.intensity) * 0.035;
          c.softness += (0.88 - gatherT * 0.38 - c.softness) * 0.04;
        } else if (c.phase === "swim" || c.phase === "split") {
          const breath = 0.62 + 0.24 * Math.sin(now * 0.0024) * c.dash;
          c.intensity += (breath - c.intensity) * 0.03;
          c.softness += ((c.phase === "split" ? 0.62 : 0.72) - c.softness) * 0.03;
        } else if (c.phase === "burst") {
          c.softness += (0.95 - c.softness) * 0.1;
          if (c.flash > 0.35) c.intensity += (1.25 - c.intensity) * 0.16;
          else c.intensity += (0.35 - c.intensity) * 0.06;
        }
      } else {
        c.intensity = 0.7;
        c.softness = 0;
      }

      c.flash *= 0.94;

      for (const b of c.bodies) {
        const born = age >= b.birthDelay;
        const hub = c.hubs[b.hubIndex] ?? c.hubs[0] ?? { x: c.x, y: c.y };

        if (c.kind === "bubble") {
          const breathe = 1 + Math.sin(now * 0.0012 + b.phase) * 0.22;
          b.size += (b.targetSize * breathe - b.size) * 0.045;
        } else {
          const grow = 1 + c.softness * 2.2;
          b.size += (b.targetSize * grow - b.size) * 0.045;
        }

        if (!born && c.phase === "birth") {
          b.alpha += (0 - b.alpha) * 0.1;
          b.x += b.vx;
          b.y += b.vy;
          b.vx *= 0.985;
          b.vy *= 0.985;
          continue;
        }

        if (c.phase === "birth") {
          const cap = c.kind === "light" ? 0.42 * c.intensity + 0.12 : 0.55;
          b.alpha += (cap - b.alpha) * (c.kind === "light" ? 0.02 : 0.03);
          // 広く漂ってから集まる
          b.vx += (Math.sin(now * 0.0007 + b.phase) * 0.04 - b.vx) * 0.04;
          b.vy +=
            (c.kind === "bubble" ? -0.28 : Math.cos(now * 0.0006 + b.phase) * 0.025) -
            b.vy * 0.04;
        } else if (c.phase === "burst") {
          if (c.kind === "light") {
            const faint = 0.18 + 0.12 * Math.max(0, c.flash);
            b.alpha += (faint - b.alpha) * 0.08;
            b.size += (b.targetSize * (1.1 + c.flash * 0.4) - b.size) * 0.08;
          } else {
            b.alpha += (0 - b.alpha) * 0.16;
            b.size += (b.targetSize * 1.6 - b.size) * 0.1;
          }
        } else {
          const cap =
            c.kind === "light"
              ? c.phase === "gather"
                ? 0.28 * c.intensity + 0.12 + gatherT * 0.28
                : 0.55 * c.intensity + 0.15
              : 0.72;
          b.alpha += (cap - b.alpha) * 0.035;
          const dx = hub.x - b.x;
          const dy = hub.y - b.y;
          const dist = Math.hypot(dx, dy) || 1;
          const reach =
            c.kind === "light" && (c.phase === "gather" || c.phase === "split")
              ? 280
              : 140;
          b.vx += (dx / dist) * gatherStrength * Math.min(dist, reach) * 0.02;
          b.vy += (dy / dist) * gatherStrength * Math.min(dist, reach) * 0.02;
          if (c.phase === "swim" || c.phase === "split") {
            const trail =
              c.kind === "light" ? 0.042 * (0.7 + c.dash * 0.5) : 0.026;
            b.vx += (-dy / dist) * trail;
            b.vy += (dx / dist) * trail;
            if (c.kind === "light") {
              b.vx += hub.vx * 0.045;
              b.vy += hub.vy * 0.045;
            }
          }
          if (dist < (c.kind === "bubble" ? 54 : 62)) {
            b.joined = true;
            joined += 1;
          }
        }

        b.vx *= c.kind === "light" && c.phase === "burst" ? 0.97 : 0.92;
        b.vy *= c.kind === "light" && c.phase === "burst" ? 0.97 : 0.92;
        b.x += b.vx;
        b.y += b.vy;

        if (c.kind === "light") {
          b.x = clamp(b.x, w * 0.01, w * 0.99);
          b.y = clamp(b.y, h * 0.01, h * 0.98);
        } else if (c.phase !== "burst") {
          if (b.y > h * 0.28) b.vy -= 0.045;
          else if (b.y > h * 0.14) b.vy -= 0.018;
        }
      }

      const ratio = joined / Math.max(1, c.bodies.length);
      const glowTarget =
        c.phase === "swim" || c.phase === "split"
          ? (0.5 + 0.22 * c.dash) * c.intensity
          : c.phase === "gather"
            ? (0.12 + ratio * 0.48) * c.intensity
            : c.phase === "burst"
              ? c.flash * 1.1
              : c.phase === "birth"
                ? 0.05 * c.intensity
                : 0;
      c.glow += (glowTarget - c.glow) * 0.05;

      if (c.sparks.length > 0) {
        const next: Spark[] = [];
        for (const s of c.sparks) {
          s.life -= c.kind === "light" ? 0.015 : 0.022;
          s.x += s.vx;
          s.y += s.vy;
          s.vy += c.kind === "light" ? 0.006 : 0.015;
          s.vx *= 0.988;
          if (s.life > 0) next.push(s);
        }
        c.sparks = next;
      }
    };

    const drawSparks = (c: Creature) => {
      for (const s of c.sparks) {
        const t = s.life / s.maxLife;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.9 * t})`;
        ctx.arc(s.x, s.y, s.size * (0.5 + t * 0.7), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(125,211,252,${0.45 * t})`;
        ctx.arc(s.x, s.y, s.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawHubGlow = (hub: Hub, c: Creature) => {
      if (c.glow <= 0.06) return;
      const soft = c.softness;
      if (soft <= 0.12 && c.flash <= 0.2) return;
      const radius = 34 + c.glow * 70 + c.flash * 55 + c.dash * 14;
      const g = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, radius);
      const peak = Math.min(0.62, 0.12 * c.glow + c.flash * 0.48);
      g.addColorStop(0, `rgba(255,255,255,${peak})`);
      g.addColorStop(0.28, `rgba(186,242,255,${peak * 0.55})`);
      g.addColorStop(0.62, `rgba(125,211,252,${peak * 0.22})`);
      g.addColorStop(1, "rgba(34,211,238,0)");
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(hub.x, hub.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawLightCreature = (c: Creature) => {
      const soft = c.softness;
      for (const hub of c.hubs) drawHubGlow(hub, c);

      for (const b of c.bodies) {
        if (b.alpha < 0.015) continue;
        const a = Math.min(0.85, b.alpha);

        if (soft < 0.28) {
          const r = Math.max(1.1, b.size * (1 - soft * 0.35));
          ctx.beginPath();
          ctx.fillStyle = `rgba(210, 245, 255, ${a})`;
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const r = b.size * (0.9 + soft * 1.65);
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
          g.addColorStop(0, `rgba(255,255,255,${0.48 * a})`);
          g.addColorStop(0.45, `rgba(165,243,252,${0.26 * a * soft})`);
          g.addColorStop(1, "rgba(34,211,238,0)");
          ctx.beginPath();
          ctx.fillStyle = g;
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      drawSparks(c);
    };

    const drawBubbleCreature = (c: Creature) => {
      if (c.glow > 0.12 && c.phase !== "burst") {
        const radius = 26 + c.glow * 40;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
        g.addColorStop(0, `rgba(186,242,255,${0.07 * c.glow})`);
        g.addColorStop(1, "rgba(8,47,73,0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const b of c.bodies) {
        if (b.alpha < 0.02) continue;
        const r = Math.max(2.5, b.size);
        ctx.beginPath();
        ctx.fillStyle = `rgba(186, 242, 255, ${0.045 * b.alpha})`;
        ctx.strokeStyle = `rgba(200, 240, 255, ${0.42 * b.alpha})`;
        ctx.lineWidth = 1.1;
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * b.alpha})`;
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.arc(b.x, b.y, r * 0.72, -Math.PI * 0.95, -Math.PI * 0.45);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.35 * b.alpha})`;
        ctx.arc(b.x - r * 0.32, b.y - r * 0.34, Math.max(0.8, r * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }

      drawSparks(c);
    };

    const draw = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (now - lastFrame < frameMs) return;
      lastFrame = now;

      ctx.clearRect(0, 0, w, h);
      for (const c of creatures) {
        advancePhase(c, now);
        steerCreature(c, now);
        stepBodies(c, now);
        if (c.kind === "light") drawLightCreature(c);
        else drawBubbleCreature(c);
      }
    };

    resize();
    raf = requestAnimationFrame(draw);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [moteCount, bubbleCount]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1]"
      aria-hidden
    />
  );
}
