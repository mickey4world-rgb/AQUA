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

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
};

type Creature = {
  kind: "light" | "bubble";
  phase: LifePhase;
  phaseUntil: number;
  phaseStarted: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  bodies: SoftBody[];
  glow: number;
  /** 0=シャープな点 … 1=ぼやけた塊 */
  softness: number;
  flash: number;
  sparks: Spark[];
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
    const y = softRand(i * 5.7 + 2) * h * 0.5 + h * 0.05;
    // 集合前は小さな存在感（シャープ描画向け）
    const size = 2.2 + softRand(i * 2.2) * 2.4;
    bodies.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size,
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
    const y = h * (0.9 + softRand(i * 1.7) * 0.1);
    const size = 7 + softRand(i * 6.3) * 16;
    bodies.push({
      x,
      y,
      vx: (softRand(i * 2.9) - 0.5) * 0.2,
      vy: -0.08 - softRand(i) * 0.1,
      size: size * 0.4,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 7.7) * Math.PI * 2,
      joined: false,
    });
  }
  return bodies;
}

function spawnSparks(c: Creature): Spark[] {
  const sparks: Spark[] = [];
  const n = Math.min(28, 10 + c.bodies.length);
  for (let i = 0; i < n; i += 1) {
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const speed = 0.6 + Math.random() * 1.8;
    sparks.push({
      x: c.x + (Math.random() - 0.5) * 24,
      y: c.y + (Math.random() - 0.5) * 18,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 0.4,
      life: 1,
      maxLife: 0.55 + Math.random() * 0.45,
      size: 1.1 + Math.random() * 1.8,
    });
  }
  return sparks;
}

function createCreatures(
  w: number,
  h: number,
  moteCount: number,
  bubbleCount: number,
): Creature[] {
  const now = performance.now();
  // 負荷軽減: 光1体 + 泡1体
  return [
    {
      kind: "light",
      phase: "birth",
      phaseUntil: now + 3000,
      phaseStarted: now,
      x: w * 0.48,
      y: h * 0.28,
      vx: 0.16,
      vy: 0.04,
      heading: -0.4,
      bodies: makeLightBodies(w, h, moteCount),
      glow: 0,
      softness: 0,
      flash: 0,
      sparks: [],
    },
    {
      kind: "bubble",
      phase: "birth",
      phaseUntil: now + 2600,
      phaseStarted: now,
      x: w * 0.5,
      y: h * 0.84,
      vx: 0.1,
      vy: -0.06,
      heading: 0.25,
      bodies: makeBubbleBodies(w, h, bubbleCount),
      glow: 0,
      softness: 0,
      flash: 0,
      sparks: [],
    },
  ];
}

/**
 * 光: 集合前はシャープな小点 → 集まりぼやける → 消える瞬間に一瞬輝く
 * 泡: より上まで泳ぎ、割れるとキラキラ散る
 * 軽量: 1+1体、DPR制限、30fps、hidden時停止、単色塗り多用
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
    const frameMs = 33; // ~30fps

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      // 高DPIは重いので上限 1.25
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

    const respawnCreature = (c: Creature, now: number) => {
      c.phase = "birth";
      c.phaseStarted = now;
      c.phaseUntil = now + (c.kind === "bubble" ? 2800 : 3200);
      c.glow = 0;
      c.softness = 0;
      c.flash = 0;
      c.sparks = [];
      c.heading = Math.random() * Math.PI * 2;
      if (c.kind === "light") {
        c.x = w * (0.28 + Math.random() * 0.44);
        c.y = h * (0.16 + Math.random() * 0.26);
        c.vx = Math.cos(c.heading) * 0.14;
        c.vy = Math.sin(c.heading) * 0.08;
        c.bodies = makeLightBodies(w, h, c.bodies.length);
      } else {
        c.x = w * (0.28 + Math.random() * 0.44);
        c.y = h * 0.92;
        c.vx = Math.cos(c.heading) * 0.1;
        c.vy = -0.08;
        c.bodies = makeBubbleBodies(w, h, c.bodies.length);
      }
    };

    const advancePhase = (c: Creature, now: number) => {
      if (now < c.phaseUntil) return;
      if (c.phase === "birth") {
        c.phase = "gather";
        c.phaseStarted = now;
        c.phaseUntil = now + (c.kind === "bubble" ? 4800 : 4500);
      } else if (c.phase === "gather") {
        c.phase = "swim";
        c.phaseStarted = now;
        c.phaseUntil = now + (c.kind === "bubble" ? 7200 : 7000);
        c.vx = Math.cos(c.heading) * (c.kind === "bubble" ? 0.2 : 0.26);
        c.vy = Math.sin(c.heading) * (c.kind === "bubble" ? 0.1 : 0.12);
      } else if (c.phase === "swim") {
        c.phaseStarted = now;
        if (c.kind === "bubble") {
          c.phase = "burst";
          c.phaseUntil = now + 1400;
          c.sparks = spawnSparks(c);
          c.flash = 1;
        } else {
          c.phase = "fade";
          c.phaseUntil = now + 2600;
          c.flash = 1; // 消える瞬間の閃光
        }
      } else {
        respawnCreature(c, now);
      }
    };

    const steerCreature = (c: Creature, now: number) => {
      const sec = now * 0.001;
      c.heading += Math.sin(sec * 0.33 + c.x * 0.001) * 0.008;
      const speed = c.kind === "bubble" ? 0.22 : 0.24;
      const targetVx = Math.cos(c.heading) * speed;
      const targetVy =
        c.kind === "bubble"
          ? -0.1 + Math.sin(sec * 0.35) * 0.05
          : Math.sin(c.heading) * speed * 0.5;

      if (c.phase === "swim" || c.phase === "gather") {
        c.vx += (targetVx - c.vx) * 0.02;
        c.vy += (targetVy - c.vy) * 0.02;
        c.x += c.vx;
        c.y += c.vy;
      }

      if (c.kind === "light") {
        if (c.x < w * 0.12) c.heading = 0.2;
        if (c.x > w * 0.88) c.heading = Math.PI - 0.2;
        if (c.y < h * 0.08) c.heading = 0.85;
        if (c.y > h * 0.5) c.heading = -0.85;
        c.x = clamp(c.x, w * 0.1, w * 0.9);
        c.y = clamp(c.y, h * 0.08, h * 0.5);
      } else {
        // もう少し上まで（海面寄り）
        if (c.x < w * 0.14) c.heading = 0.25;
        if (c.x > w * 0.86) c.heading = Math.PI - 0.25;
        c.x = clamp(c.x, w * 0.12, w * 0.88);
        c.y = clamp(c.y, h * 0.48, h * 0.92);
      }
    };

    const stepBodies = (c: Creature, now: number) => {
      const gatherStrength =
        c.phase === "gather" ? 0.038 : c.phase === "swim" ? 0.052 : 0.01;
      let joined = 0;

      // 集合につれてぼやける
      const softTarget =
        c.phase === "birth"
          ? 0
          : c.phase === "gather"
            ? 0.45
            : c.phase === "swim"
              ? 0.85
              : c.phase === "fade"
                ? 0.95
                : 0.3;
      c.softness += (softTarget - c.softness) * 0.045;
      c.flash *= 0.92;

      for (const b of c.bodies) {
        if (c.kind === "bubble") {
          const breathe = 1 + Math.sin(now * 0.0012 + b.phase) * 0.2;
          b.size += (b.targetSize * breathe - b.size) * 0.045;
        } else {
          // 光: 集合前は小さくシャープ、集合後は少し広がる
          const grow = 1 + c.softness * 2.8;
          b.size += (b.targetSize * grow - b.size) * 0.05;
        }

        if (c.phase === "birth") {
          b.alpha += (0.85 - b.alpha) * 0.035;
          b.vx += (Math.sin(now * 0.0006 + b.phase) * 0.025 - b.vx) * 0.05;
          b.vy +=
            (c.kind === "bubble" ? -0.14 : Math.cos(now * 0.0005 + b.phase) * 0.012) -
            b.vy * 0.05;
        } else if (c.phase === "fade") {
          // 閃光のあとゆっくり消える
          const fadeBoost = c.flash > 0.35 ? 0.95 : 0;
          b.alpha += ((fadeBoost > 0 ? 1 : 0) - b.alpha) * (fadeBoost > 0 ? 0.2 : 0.04);
          if (c.flash <= 0.35) b.alpha += (0 - b.alpha) * 0.05;
        } else if (c.phase === "burst") {
          b.alpha += (0 - b.alpha) * 0.15;
          b.size += (b.targetSize * 1.8 - b.size) * 0.1;
        } else {
          b.alpha += (0.78 - b.alpha) * 0.04;
          const dx = c.x - b.x;
          const dy = c.y - b.y;
          const dist = Math.hypot(dx, dy) || 1;
          b.vx += (dx / dist) * gatherStrength * Math.min(dist, 120) * 0.02;
          b.vy += (dy / dist) * gatherStrength * Math.min(dist, 120) * 0.02;
          if (c.phase === "swim") {
            b.vx += (-dy / dist) * 0.028;
            b.vy += (dx / dist) * 0.028;
          }
          if (dist < (c.kind === "bubble" ? 52 : 58)) {
            b.joined = true;
            joined += 1;
          }
        }

        b.vx *= 0.92;
        b.vy *= 0.92;
        b.x += b.vx;
        b.y += b.vy;

        // 泡は出生〜泳ぎで上へ寄せる
        if (c.kind === "bubble" && (c.phase === "birth" || c.phase === "gather")) {
          if (b.y > h * 0.72) b.vy -= 0.02;
        }
      }

      const ratio = joined / Math.max(1, c.bodies.length);
      const glowTarget =
        c.phase === "swim"
          ? 0.8
          : c.phase === "gather"
            ? 0.25 + ratio * 0.45
            : c.phase === "fade"
              ? c.flash * 0.9
              : 0;
      c.glow += (glowTarget - c.glow) * 0.05;

      // キラキラ更新
      if (c.sparks.length > 0) {
        const next: Spark[] = [];
        for (const s of c.sparks) {
          s.life -= 0.03;
          s.x += s.vx;
          s.y += s.vy;
          s.vy += 0.02;
          s.vx *= 0.98;
          if (s.life > 0) next.push(s);
        }
        c.sparks = next;
      }
    };

    const drawLightCreature = (c: Creature) => {
      const soft = c.softness;

      if ((c.glow > 0.08 || c.flash > 0.2) && soft > 0.2) {
        const radius = 36 + c.glow * 64 + c.flash * 28;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
        const peak = Math.min(1, 0.2 * c.glow + c.flash * 0.55);
        g.addColorStop(0, `rgba(255,255,255,${peak})`);
        g.addColorStop(0.4, `rgba(165,243,252,${peak * 0.55})`);
        g.addColorStop(1, "rgba(34,211,238,0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const b of c.bodies) {
        if (b.alpha < 0.02) continue;
        const a = Math.min(1, b.alpha + c.flash * 0.35);

        if (soft < 0.25) {
          // シャープな小さな存在
          const r = Math.max(1.4, b.size * (1 - soft * 0.4));
          ctx.beginPath();
          ctx.fillStyle = `rgba(226, 250, 255, ${a})`;
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
          // ごく薄い芯だけ（ぼかし無し）
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
          ctx.arc(b.x, b.y, Math.max(0.7, r * 0.35), 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 集合するほどぼやける（グラデは1体あたり最大1回）
          const r = b.size * (0.9 + soft * 1.4);
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
          g.addColorStop(0, `rgba(255,255,255,${0.5 * a})`);
          g.addColorStop(0.45, `rgba(165,243,252,${0.28 * a * soft})`);
          g.addColorStop(1, "rgba(34,211,238,0)");
          ctx.beginPath();
          ctx.fillStyle = g;
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawBubbleCreature = (c: Creature) => {
      if (c.glow > 0.1 && c.phase !== "burst") {
        const radius = 30 + c.glow * 48;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
        g.addColorStop(0, `rgba(186,242,255,${0.1 * c.glow})`);
        g.addColorStop(1, "rgba(8,47,73,0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const b of c.bodies) {
        if (b.alpha < 0.02) continue;
        const r = Math.max(2, b.size);
        // 軽量: 単色＋ハイライト点のみ（二重グラデ回避）
        ctx.beginPath();
        ctx.fillStyle = `rgba(125, 211, 252, ${0.16 * b.alpha})`;
        ctx.strokeStyle = `rgba(186, 242, 255, ${0.35 * b.alpha})`;
        ctx.lineWidth = 1;
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.45 * b.alpha})`;
        ctx.arc(b.x - r * 0.28, b.y - r * 0.3, Math.max(1, r * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }

      // 割れのキラキラ
      for (const s of c.sparks) {
        const t = s.life / s.maxLife;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * t})`;
        ctx.arc(s.x, s.y, s.size * (0.6 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(125, 211, 252, ${0.55 * t})`;
        ctx.arc(s.x, s.y, s.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
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
