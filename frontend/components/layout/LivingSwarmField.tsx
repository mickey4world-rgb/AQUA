"use client";

import { useEffect, useRef } from "react";

type LivingSwarmFieldProps = {
  moteCount: number;
  bubbleCount: number;
};

type LifePhase = "birth" | "gather" | "swim" | "fade" | "burst";

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
};

type Creature = {
  kind: "light" | "bubble";
  phase: LifePhase;
  phaseUntil: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  bodies: SoftBody[];
  glow: number;
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
    const x = softRand(i * 3.1 + 1) * w;
    const y = softRand(i * 5.7 + 2) * h * 0.52 + h * 0.04;
    const size = 10 + softRand(i * 2.2) * 18;
    bodies.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size: size * 0.2,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 9.1) * Math.PI * 2,
      joined: false,
    });
  }
  return bodies;
}

function makeBubbleBodies(w: number, h: number, count: number): SoftBody[] {
  const bodies: SoftBody[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = softRand(i * 4.4 + 8) * w * 0.86 + w * 0.07;
    const y = h * (0.88 + softRand(i * 1.7) * 0.14);
    const size = 8 + softRand(i * 6.3) * 22;
    bodies.push({
      x,
      y,
      vx: (softRand(i * 2.9) - 0.5) * 0.2,
      vy: -0.05 - softRand(i) * 0.08,
      size: size * 0.35,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 7.7) * Math.PI * 2,
      joined: false,
    });
  }
  return bodies;
}

function createCreatures(w: number, h: number, moteCount: number, bubbleCount: number): Creature[] {
  const now = performance.now();
  return [
    {
      kind: "light",
      phase: "birth",
      phaseUntil: now + 3200,
      x: w * 0.42,
      y: h * 0.28,
      vx: 0.18,
      vy: 0.05,
      heading: -0.35,
      bodies: makeLightBodies(w, h, moteCount),
      glow: 0,
    },
    {
      kind: "light",
      phase: "gather",
      phaseUntil: now + 1800,
      x: w * 0.68,
      y: h * 0.22,
      vx: -0.12,
      vy: 0.08,
      heading: 2.4,
      bodies: makeLightBodies(w, h, Math.max(8, Math.floor(moteCount * 0.55))).map((b, i) => ({
        ...b,
        x: w * (0.55 + softRand(i + 40) * 0.3),
        y: h * (0.12 + softRand(i + 50) * 0.28),
        alpha: 0.15,
      })),
      glow: 0.2,
    },
    {
      kind: "bubble",
      phase: "birth",
      phaseUntil: now + 2800,
      x: w * 0.5,
      y: h * 0.82,
      vx: 0.1,
      vy: -0.04,
      heading: 0.2,
      bodies: makeBubbleBodies(w, h, bubbleCount),
      glow: 0,
    },
  ];
}

/**
 * 光は大きな光の塊として生まれ・集まり・泳ぎ・消える。
 * 泡は下から生まれ、大きさ変化しながら集合し、集合後にまとめて割れる。
 * どちらも「大きな生き物」として泳ぐ。
 */
export default function LivingSwarmField({
  moteCount,
  bubbleCount,
}: LivingSwarmFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let creatures: Creature[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creatures = createCreatures(w, h, moteCount, bubbleCount);
    };

    const respawnCreature = (c: Creature, now: number) => {
      c.phase = "birth";
      c.phaseUntil = now + (c.kind === "bubble" ? 3000 : 3600);
      c.glow = 0;
      c.heading = Math.random() * Math.PI * 2;
      if (c.kind === "light") {
        c.x = w * (0.25 + Math.random() * 0.5);
        c.y = h * (0.16 + Math.random() * 0.28);
        c.vx = Math.cos(c.heading) * 0.16;
        c.vy = Math.sin(c.heading) * 0.1;
        c.bodies = makeLightBodies(w, h, c.bodies.length);
      } else {
        c.x = w * (0.28 + Math.random() * 0.44);
        c.y = h * 0.9;
        c.vx = Math.cos(c.heading) * 0.12;
        c.vy = -0.05;
        c.bodies = makeBubbleBodies(w, h, c.bodies.length);
      }
    };

    const advancePhase = (c: Creature, now: number) => {
      if (now < c.phaseUntil) return;
      if (c.phase === "birth") {
        c.phase = "gather";
        c.phaseUntil = now + (c.kind === "bubble" ? 5200 : 4800);
      } else if (c.phase === "gather") {
        c.phase = "swim";
        c.phaseUntil = now + (c.kind === "bubble" ? 7000 : 7800);
        // 集合したら「一つの生き物」として泳ぎ始める
        c.vx = Math.cos(c.heading) * (c.kind === "bubble" ? 0.22 : 0.28);
        c.vy = Math.sin(c.heading) * (c.kind === "bubble" ? 0.08 : 0.14);
      } else if (c.phase === "swim") {
        if (c.kind === "bubble") {
          c.phase = "burst";
          c.phaseUntil = now + 1600;
        } else {
          c.phase = "fade";
          c.phaseUntil = now + 3200;
        }
      } else {
        respawnCreature(c, now);
      }
    };

    const steerCreature = (c: Creature, now: number) => {
      const sec = now * 0.001;
      // 大きな生き物らしいゆっくりした進路変更
      c.heading += Math.sin(sec * 0.33 + c.x * 0.001) * 0.008;
      const speed = c.kind === "bubble" ? 0.2 : 0.26;
      const targetVx = Math.cos(c.heading) * speed;
      const targetVy =
        c.kind === "bubble"
          ? -0.04 + Math.sin(sec * 0.4) * 0.05
          : Math.sin(c.heading) * speed * 0.55;

      if (c.phase === "swim" || c.phase === "gather") {
        c.vx += (targetVx - c.vx) * 0.02;
        c.vy += (targetVy - c.vy) * 0.02;
        c.x += c.vx;
        c.y += c.vy;
      }

      if (c.kind === "light") {
        if (c.x < w * 0.12) c.heading = 0.15;
        if (c.x > w * 0.88) c.heading = Math.PI - 0.15;
        if (c.y < h * 0.08) c.heading = 0.9;
        if (c.y > h * 0.52) c.heading = -0.9;
        c.x = clamp(c.x, w * 0.1, w * 0.9);
        c.y = clamp(c.y, h * 0.08, h * 0.52);
      } else {
        if (c.x < w * 0.14) c.heading = 0.2;
        if (c.x > w * 0.86) c.heading = Math.PI - 0.2;
        c.x = clamp(c.x, w * 0.12, w * 0.88);
        c.y = clamp(c.y, h * 0.58, h * 0.92);
      }
    };

    const stepBodies = (c: Creature, now: number) => {
      const gatherStrength =
        c.phase === "gather" ? 0.035 : c.phase === "swim" ? 0.05 : 0.008;
      let joined = 0;

      for (const b of c.bodies) {
        // 大きさは常にゆっくり変化（泡らしい呼吸）
        const breathe =
          c.kind === "bubble"
            ? 1 + Math.sin(now * 0.0012 + b.phase) * 0.18
            : 1 + Math.sin(now * 0.0008 + b.phase) * 0.08;
        const desired = b.targetSize * breathe;
        b.size += (desired - b.size) * 0.04;

        if (c.phase === "birth") {
          b.alpha += (0.55 - b.alpha) * 0.02;
          // 下／周囲から中心へゆっくり寄る前の漂い
          b.vx += (Math.sin(now * 0.0006 + b.phase) * 0.02 - b.vx) * 0.04;
          b.vy +=
            (c.kind === "bubble" ? -0.08 : Math.cos(now * 0.0005 + b.phase) * 0.015) -
            b.vy * 0.04;
        } else if (c.phase === "fade") {
          b.alpha += (0 - b.alpha) * 0.025;
          b.size += (b.targetSize * 1.35 - b.size) * 0.02;
        } else if (c.phase === "burst") {
          b.alpha += (0 - b.alpha) * 0.08;
          b.size += (b.targetSize * 2.2 - b.size) * 0.08;
        } else {
          // gather / swim: 集合体に残り続ける（個別には消えない）
          b.alpha += (0.7 - b.alpha) * 0.03;
          const dx = c.x - b.x;
          const dy = c.y - b.y;
          const dist = Math.hypot(dx, dy) || 1;
          b.vx += (dx / dist) * gatherStrength * Math.min(dist, 120) * 0.02;
          b.vy += (dy / dist) * gatherStrength * Math.min(dist, 120) * 0.02;
          // 生き物の輪郭に沿った周回
          if (c.phase === "swim") {
            b.vx += (-dy / dist) * 0.03;
            b.vy += (dx / dist) * 0.03;
          }
          if (dist < (c.kind === "bubble" ? 48 : 56)) {
            b.joined = true;
            joined += 1;
          }
        }

        b.vx *= 0.92;
        b.vy *= 0.92;
        b.x += b.vx;
        b.y += b.vy;

        if (c.kind === "bubble" && c.phase === "birth" && b.y < h * 0.62) {
          // 出生中は水面付近まで上がりすぎない
          b.vy *= 0.5;
        }
      }

      // 集合度で本体の発光を育てる
      const ratio = joined / Math.max(1, c.bodies.length);
      const glowTarget =
        c.phase === "swim"
          ? 0.85
          : c.phase === "gather"
            ? 0.35 + ratio * 0.45
            : c.phase === "birth"
              ? 0.15
              : 0;
      c.glow += (glowTarget - c.glow) * 0.04;
    };

    const drawLightCreature = (c: Creature) => {
      // 大きな光の塊（メタボール風）
      if (c.glow > 0.05) {
        const radius = 42 + c.glow * 70;
        const g = ctx.createRadialGradient(c.x, c.y, radius * 0.1, c.x, c.y, radius);
        g.addColorStop(0, `rgba(224, 250, 255, ${0.22 * c.glow})`);
        g.addColorStop(0.35, `rgba(103, 232, 249, ${0.18 * c.glow})`);
        g.addColorStop(0.7, `rgba(34, 211, 238, ${0.08 * c.glow})`);
        g.addColorStop(1, "rgba(14, 165, 233, 0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const b of c.bodies) {
        if (b.alpha < 0.02) continue;
        const r = b.size;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, `rgba(240, 253, 255, ${0.55 * b.alpha})`);
        g.addColorStop(0.4, `rgba(165, 243, 252, ${0.28 * b.alpha})`);
        g.addColorStop(1, "rgba(34, 211, 238, 0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawBubbleCreature = (c: Creature) => {
      if (c.glow > 0.08 && c.phase !== "burst") {
        const radius = 36 + c.glow * 55;
        const g = ctx.createRadialGradient(c.x, c.y, radius * 0.15, c.x, c.y, radius);
        g.addColorStop(0, `rgba(186, 242, 255, ${0.12 * c.glow})`);
        g.addColorStop(0.55, `rgba(56, 189, 248, ${0.08 * c.glow})`);
        g.addColorStop(1, "rgba(8, 47, 73, 0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const b of c.bodies) {
        if (b.alpha < 0.02) continue;
        const r = Math.max(2, b.size);
        const g = ctx.createRadialGradient(
          b.x - r * 0.28,
          b.y - r * 0.32,
          r * 0.08,
          b.x,
          b.y,
          r,
        );
        g.addColorStop(0, `rgba(255,255,255,${0.55 * b.alpha})`);
        g.addColorStop(0.4, `rgba(165,243,252,${0.28 * b.alpha})`);
        g.addColorStop(1, `rgba(14,116,144,${0.08 * b.alpha})`);
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.strokeStyle = `rgba(186, 242, 255, ${0.25 * b.alpha})`;
        ctx.lineWidth = 1;
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // ハイライト
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.35 * b.alpha})`;
        ctx.arc(b.x - r * 0.28, b.y - r * 0.3, Math.max(1.2, r * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const draw = (now: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      for (const c of creatures) {
        advancePhase(c, now);
        steerCreature(c, now);
        stepBodies(c, now);
        if (c.kind === "light") drawLightCreature(c);
        else drawBubbleCreature(c);
      }

      raf = requestAnimationFrame(draw);
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
