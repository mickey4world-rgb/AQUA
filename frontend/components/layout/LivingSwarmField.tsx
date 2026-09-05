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
  /** 出現のずれ（自然な生まれ方） */
  birthDelay: number;
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
  /** 0=シャープ … 1=ぼやけ */
  softness: number;
  /** 全体の明るさ倍率（出生〜泳ぎで徐々に変化） */
  intensity: number;
  flash: number;
  sparks: Spark[];
  /** 泳ぎの勢い（光の駆け回り用） */
  dash: number;
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
    const size = 1.8 + softRand(i * 2.2) * 2.2;
    bodies.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size: size * 0.4,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 9.1) * Math.PI * 2,
      joined: false,
      birthDelay: softRand(i * 4.3) * 2200,
    });
  }
  return bodies;
}

function makeBubbleBodies(w: number, h: number, count: number): SoftBody[] {
  const bodies: SoftBody[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = softRand(i * 4.4 + 8) * w * 0.86 + w * 0.07;
    const y = h * (0.9 + softRand(i * 1.7) * 0.1);
    const size = 8 + softRand(i * 6.3) * 18;
    bodies.push({
      x,
      y,
      vx: (softRand(i * 2.9) - 0.5) * 0.2,
      vy: -0.18 - softRand(i) * 0.16,
      size: size * 0.35,
      targetSize: size,
      alpha: 0,
      phase: softRand(i * 7.7) * Math.PI * 2,
      joined: false,
      birthDelay: softRand(i * 3.8) * 900,
    });
  }
  return bodies;
}

function spawnSparks(c: Creature): Spark[] {
  const sparks: Spark[] = [];
  const n = Math.min(40, 16 + c.bodies.length * 2);
  for (let i = 0; i < n; i += 1) {
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.55;
    const speed = 1.4 + Math.random() * 3.4;
    sparks.push({
      x: c.x + (Math.random() - 0.5) * 36,
      y: c.y + (Math.random() - 0.5) * 28,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 0.6,
      life: 1,
      maxLife: 0.7 + Math.random() * 0.7,
      size: 1 + Math.random() * 2.2,
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
  return [
    {
      kind: "light",
      phase: "birth",
      phaseUntil: now + 4800,
      phaseStarted: now,
      x: w * 0.48,
      y: h * 0.28,
      vx: 0.14,
      vy: 0.03,
      heading: -0.4,
      bodies: makeLightBodies(w, h, moteCount),
      glow: 0,
      softness: 0,
      intensity: 0,
      flash: 0,
      sparks: [],
      dash: 0,
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
      bodies: makeBubbleBodies(w, h, bubbleCount),
      glow: 0,
      softness: 0,
      intensity: 0.5,
      flash: 0,
      sparks: [],
      dash: 0,
    },
  ];
}

/**
 * 光: 生まれ → 集合 → 駆け回って泳ぐ → 明るく光って自然に消える（光線なし）
 * 泡: 透明な自然泡、画面上部まで上昇、割れで広範囲キラキラ
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

    const respawnCreature = (c: Creature, now: number) => {
      c.phase = "birth";
      c.phaseStarted = now;
      c.phaseUntil = now + (c.kind === "bubble" ? 3000 : 5000);
      c.glow = 0;
      c.softness = 0;
      c.intensity = 0;
      c.flash = 0;
      c.dash = 0;
      c.sparks = [];
      c.heading = Math.random() * Math.PI * 2;
      if (c.kind === "light") {
        c.x = w * (0.28 + Math.random() * 0.44);
        c.y = h * (0.16 + Math.random() * 0.26);
        c.vx = Math.cos(c.heading) * 0.12;
        c.vy = Math.sin(c.heading) * 0.07;
        c.bodies = makeLightBodies(w, h, c.bodies.length);
      } else {
        c.x = w * (0.28 + Math.random() * 0.44);
        c.y = h * 0.94;
        c.vx = Math.cos(c.heading) * 0.1;
        c.vy = -0.16;
        c.bodies = makeBubbleBodies(w, h, c.bodies.length);
        c.intensity = 0.45;
      }
    };

    const advancePhase = (c: Creature, now: number) => {
      if (now < c.phaseUntil) return;
      if (c.phase === "birth") {
        c.phase = "gather";
        c.phaseStarted = now;
        c.phaseUntil = now + (c.kind === "bubble" ? 4800 : 4200);
      } else if (c.phase === "gather") {
        c.phase = "swim";
        c.phaseStarted = now;
        // 光は集合体として長く駆け回って泳ぐ
        c.phaseUntil = now + (c.kind === "bubble" ? 9000 : 11000);
        c.dash = c.kind === "light" ? 1 : 0;
        c.vx = Math.cos(c.heading) * (c.kind === "bubble" ? 0.22 : 0.55);
        c.vy = Math.sin(c.heading) * (c.kind === "bubble" ? 0.12 : 0.32);
      } else if (c.phase === "swim") {
        c.phaseStarted = now;
        if (c.kind === "bubble") {
          c.phase = "burst";
          c.phaseUntil = now + 1600;
          c.sparks = spawnSparks(c);
          c.flash = 0.85;
        } else {
          // 明るく光ってから溶ける（光線は出さない）
          c.phase = "fade";
          c.phaseUntil = now + 2400;
          c.flash = 1;
          c.dash = 0;
        }
      } else {
        respawnCreature(c, now);
      }
    };

    const steerCreature = (c: Creature, now: number) => {
      const sec = now * 0.001;
      const age = now - c.phaseStarted;

      if (c.kind === "light" && c.phase === "swim") {
        // 生き物らしく急に曲がって駆け回る
        const dart =
          Math.sin(sec * 1.7 + c.x * 0.008) * 0.045 +
          Math.sin(sec * 0.55 + age * 0.0011) * 0.028;
        c.heading += dart;
        // ときどき方向を大きく変える
        if (Math.sin(sec * 0.9 + c.y * 0.01) > 0.92) {
          c.heading += (Math.sin(sec * 3.1) > 0 ? 1 : -1) * 0.12;
        }
        const speed = 0.42 + 0.28 * Math.abs(Math.sin(sec * 1.15 + age * 0.0008));
        const targetVx = Math.cos(c.heading) * speed;
        const targetVy = Math.sin(c.heading) * speed * 0.72;
        c.vx += (targetVx - c.vx) * 0.055;
        c.vy += (targetVy - c.vy) * 0.055;
        c.x += c.vx;
        c.y += c.vy;
        c.dash = 0.65 + 0.35 * Math.min(1, Math.hypot(c.vx, c.vy) / 0.7);
      } else if (c.phase === "swim" || c.phase === "gather") {
        c.heading += Math.sin(sec * 0.33 + c.x * 0.001) * 0.008;
        const speed = c.kind === "bubble" ? 0.28 : 0.22;
        const targetVx = Math.cos(c.heading) * speed;
        const targetVy =
          c.kind === "bubble"
            ? -0.22 + Math.sin(sec * 0.35) * 0.06
            : Math.sin(c.heading) * speed * 0.45;
        c.vx += (targetVx - c.vx) * 0.028;
        c.vy += (targetVy - c.vy) * 0.028;
        c.x += c.vx;
        c.y += c.vy;
      } else if (c.kind === "light" && c.phase === "fade") {
        // 消え際は少し減速して浮く
        c.vx *= 0.96;
        c.vy *= 0.96;
        c.x += c.vx * 0.35;
        c.y += c.vy * 0.35 - 0.04;
      }

      if (c.kind === "light") {
        if (c.x < w * 0.1) c.heading = 0.15 + Math.random() * 0.4;
        if (c.x > w * 0.9) c.heading = Math.PI - 0.15 - Math.random() * 0.4;
        if (c.y < h * 0.06) c.heading = 0.9 + Math.random() * 0.5;
        if (c.y > h * 0.55) c.heading = -0.9 - Math.random() * 0.4;
        c.x = clamp(c.x, w * 0.08, w * 0.92);
        c.y = clamp(c.y, h * 0.05, h * 0.56);
      } else {
        if (c.x < w * 0.14) c.heading = 0.25;
        if (c.x > w * 0.86) c.heading = Math.PI - 0.25;
        c.x = clamp(c.x, w * 0.12, w * 0.88);
        // 上部近くまで
        c.y = clamp(c.y, h * 0.1, h * 0.94);
      }
    };

    const stepBodies = (c: Creature, now: number) => {
      const gatherStrength =
        c.phase === "gather" ? 0.036 : c.phase === "swim" ? 0.05 : 0.01;
      let joined = 0;
      const age = now - c.phaseStarted;

      if (c.kind === "light") {
        if (c.phase === "birth") {
          // 静かに生まれ → 徐々に強く → 後半で少しぼやける
          const t = clamp(age / 4800, 0, 1);
          c.intensity += ((0.15 + t * 0.7) - c.intensity) * 0.03;
          c.softness += ((t > 0.55 ? (t - 0.55) * 1.4 : 0) - c.softness) * 0.04;
        } else if (c.phase === "gather") {
          c.intensity += (0.85 - c.intensity) * 0.03;
          c.softness += (0.55 - c.softness) * 0.04;
        } else if (c.phase === "swim") {
          // 駆け回りながら薄く生き、終わり近くで少し息を整える
          const t = clamp(age / 11000, 0, 1);
          const breath = 0.55 + 0.2 * Math.sin(now * 0.0022) * c.dash;
          c.intensity += (breath - t * 0.12 - c.intensity) * 0.03;
          c.softness += (0.82 - c.softness) * 0.03;
        } else if (c.phase === "fade") {
          // 一瞬明るく → 輪郭が溶けて消える（線は出さない）
          c.softness += (1 - c.softness) * 0.08;
          if (c.flash > 0.28) c.intensity += (1.35 - c.intensity) * 0.14;
          else c.intensity += (0 - c.intensity) * 0.07;
        }
      } else {
        c.intensity = 0.7;
        c.softness = 0;
      }

      c.flash *= 0.94;

      for (const b of c.bodies) {
        const born = age >= b.birthDelay;

        if (c.kind === "bubble") {
          const breathe = 1 + Math.sin(now * 0.0012 + b.phase) * 0.22;
          b.size += (b.targetSize * breathe - b.size) * 0.045;
        } else {
          const grow = 1 + c.softness * 2.2;
          b.size += (b.targetSize * grow - b.size) * 0.045;
        }

        if (!born && c.phase === "birth") {
          b.alpha += (0 - b.alpha) * 0.1;
          continue;
        }

        if (c.phase === "birth") {
          // まぶしくしない上限
          const cap = c.kind === "light" ? 0.42 * c.intensity + 0.12 : 0.55;
          b.alpha += (cap - b.alpha) * (c.kind === "light" ? 0.018 : 0.03);
          b.vx += (Math.sin(now * 0.00055 + b.phase) * 0.02 - b.vx) * 0.045;
          b.vy +=
            (c.kind === "bubble" ? -0.28 : Math.cos(now * 0.0005 + b.phase) * 0.01) -
            b.vy * 0.045;
        } else if (c.phase === "fade") {
          if (c.flash > 0.25) {
            b.alpha += (0.9 - b.alpha) * 0.1;
          } else {
            b.alpha += (0 - b.alpha) * 0.055;
          }
        } else if (c.phase === "burst") {
          b.alpha += (0 - b.alpha) * 0.16;
          b.size += (b.targetSize * 1.6 - b.size) * 0.1;
        } else {
          const cap = c.kind === "light" ? 0.55 * c.intensity + 0.15 : 0.72;
          b.alpha += (cap - b.alpha) * 0.035;
          const dx = c.x - b.x;
          const dy = c.y - b.y;
          const dist = Math.hypot(dx, dy) || 1;
          b.vx += (dx / dist) * gatherStrength * Math.min(dist, 120) * 0.02;
          b.vy += (dy / dist) * gatherStrength * Math.min(dist, 120) * 0.02;
          if (c.phase === "swim") {
            // 光は群れとして尾を引くように少し遅れてついてくる
            const trail =
              c.kind === "light" ? 0.038 * (0.7 + c.dash * 0.5) : 0.026;
            b.vx += (-dy / dist) * trail;
            b.vy += (dx / dist) * trail;
            if (c.kind === "light") {
              b.vx += c.vx * 0.04;
              b.vy += c.vy * 0.04;
            }
          }
          if (dist < (c.kind === "bubble" ? 54 : 58)) {
            b.joined = true;
            joined += 1;
          }
        }

        b.vx *= 0.92;
        b.vy *= 0.92;
        b.x += b.vx;
        b.y += b.vy;

        if (c.kind === "bubble" && c.phase !== "burst") {
          // 上部まで押し上げる
          if (b.y > h * 0.28) b.vy -= 0.045;
          else if (b.y > h * 0.14) b.vy -= 0.018;
        }
      }

      const ratio = joined / Math.max(1, c.bodies.length);
      const glowTarget =
        c.phase === "swim"
          ? (0.45 + 0.2 * c.dash) * c.intensity
          : c.phase === "gather"
            ? (0.2 + ratio * 0.4) * c.intensity
            : c.phase === "fade"
              ? c.flash * 1.05
              : c.phase === "birth"
                ? 0.05 * c.intensity
                : 0;
      c.glow += (glowTarget - c.glow) * 0.05;

      if (c.sparks.length > 0) {
        const next: Spark[] = [];
        for (const s of c.sparks) {
          s.life -= 0.022;
          s.x += s.vx;
          s.y += s.vy;
          s.vy += 0.015;
          s.vx *= 0.985;
          if (s.life > 0) next.push(s);
        }
        c.sparks = next;
      }
    };

    const drawLightCreature = (c: Creature) => {
      const soft = c.softness;

      // 生き物らしいやわらかい暈（直線の光線は使わない）
      if (c.glow > 0.06 && (soft > 0.12 || c.flash > 0.2)) {
        const radius = 34 + c.glow * 70 + c.flash * 55 + c.dash * 12;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
        const peak = Math.min(0.62, 0.12 * c.glow + c.flash * 0.48);
        g.addColorStop(0, `rgba(255,255,255,${peak})`);
        g.addColorStop(0.28, `rgba(186,242,255,${peak * 0.55})`);
        g.addColorStop(0.62, `rgba(125,211,252,${peak * 0.22})`);
        g.addColorStop(1, "rgba(34,211,238,0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

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
        // 透明な自然泡（目玉にならないよう塗りはごく薄く）
        ctx.beginPath();
        ctx.fillStyle = `rgba(186, 242, 255, ${0.045 * b.alpha})`;
        ctx.strokeStyle = `rgba(200, 240, 255, ${0.42 * b.alpha})`;
        ctx.lineWidth = 1.1;
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 光の当たり（細い三日月ハイライト）
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * b.alpha})`;
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.arc(b.x, b.y, r * 0.72, -Math.PI * 0.95, -Math.PI * 0.45);
        ctx.stroke();

        // ごく小さな点光
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.35 * b.alpha})`;
        ctx.arc(b.x - r * 0.32, b.y - r * 0.34, Math.max(0.8, r * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }

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
