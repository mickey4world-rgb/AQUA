"use client";

import { useEffect, useRef } from "react";

type LivingSwarmFieldProps = {
  moteCount: number;
  bubbleCount: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  flicker: number;
  homeX: number;
  homeY: number;
  group: number;
  kind: "mote" | "bubble";
};

type Attractor = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  radius: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function createParticles(
  w: number,
  h: number,
  moteCount: number,
  bubbleCount: number,
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < moteCount; i += 1) {
    const x = ((i * 97 + 41) % 1000) / 1000 * w;
    const y = ((i * 53 + 17) % 1000) / 1000 * h * 0.58;
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.2,
      size: i % 5 === 0 ? 2.8 : i % 3 === 0 ? 2.1 : 1.4,
      phase: Math.random() * Math.PI * 2,
      flicker: 0.55 + Math.random() * 0.9,
      homeX: x,
      homeY: y,
      group: i % 3,
      kind: "mote",
    });
  }
  for (let i = 0; i < bubbleCount; i += 1) {
    const lane = i % 2 === 0 ? 0.08 + (i % 5) * 0.06 : 0.55 + (i % 5) * 0.07;
    const x = lane * w + (Math.random() - 0.5) * 40;
    const y = h * (0.62 + Math.random() * 0.36);
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -0.12 - Math.random() * 0.18,
      size: i % 3 !== 0 ? 10 + (i % 4) * 3 : 5 + (i % 3) * 2,
      phase: Math.random() * Math.PI * 2,
      flicker: 0.4 + Math.random() * 0.6,
      homeX: x,
      homeY: y,
      group: i % 2,
      kind: "bubble",
    });
  }
  return particles;
}

function createAttractors(w: number, h: number): Attractor[] {
  return [
    { x: w * 0.32, y: h * 0.28, tx: w * 0.45, ty: h * 0.22, radius: 70 },
    { x: w * 0.68, y: h * 0.34, tx: w * 0.55, ty: h * 0.3, radius: 64 },
    { x: w * 0.5, y: h * 0.78, tx: w * 0.42, ty: h * 0.72, radius: 86 },
  ];
}

/**
 * 光の粒と泡が集まり・泳ぎ・散る集合体。
 * 「皮下で AI が生きている」感覚を、群れの呼吸として描く。
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
    let particles: Particle[] = [];
    let attractors: Attractor[] = [];
    let mode = 0; // 0 drift, 1 gather, 2 swim, 3 disperse
    let modeUntil = 0;

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
      particles = createParticles(w, h, moteCount, bubbleCount);
      attractors = createAttractors(w, h);
    };

    const pickMode = (now: number) => {
      // gather → swim → disperse → drift の呼吸（約20秒周期）
      const period = 20200;
      const local = now % period;
      if (local < 4200) {
        mode = 1;
        modeUntil = now + (4200 - local);
      } else if (local < 11200) {
        mode = 2;
        modeUntil = now + (11200 - local);
      } else if (local < 15000) {
        mode = 3;
        modeUntil = now + (15000 - local);
      } else {
        mode = 0;
        modeUntil = now + (period - local);
      }
    };

    const moveAttractors = (now: number) => {
      const sec = now * 0.001;
      for (let i = 0; i < attractors.length; i += 1) {
        const a = attractors[i];
        const baseX = i === 2 ? w * 0.5 : i === 0 ? w * 0.34 : w * 0.66;
        const baseY = i === 2 ? h * 0.76 : i === 0 ? h * 0.26 : h * 0.32;
        a.tx = baseX + Math.sin(sec * 0.35 + i * 1.7) * (i === 2 ? w * 0.18 : w * 0.14);
        a.ty = baseY + Math.cos(sec * 0.28 + i * 1.1) * (i === 2 ? h * 0.06 : h * 0.1);
        a.x += (a.tx - a.x) * 0.035;
        a.y += (a.ty - a.y) * 0.035;
      }
    };

    const stepParticle = (p: Particle, now: number) => {
      const attractor = attractors[p.kind === "bubble" ? 2 : p.group % 2];
      const flicker =
        0.22 +
        0.78 *
          Math.pow(
            0.5 + 0.5 * Math.sin(now * 0.001 * p.flicker + p.phase),
            2,
          );

      let ax = 0;
      let ay = 0;

      if (mode === 1 || mode === 2) {
        // 集合 / 群れ泳ぎ: アトラクタへ + 接線方向の流れ
        const dx = attractor.x - p.x;
        const dy = attractor.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = mode === 1 ? 0.012 : 0.006;
        ax += (dx / dist) * pull * attractor.radius * 0.02;
        ay += (dy / dist) * pull * attractor.radius * 0.02;
        // 接線（泳ぎ）
        const swim = mode === 2 ? 0.045 : 0.015;
        ax += (-dy / dist) * swim;
        ay += (dx / dist) * swim * (p.kind === "bubble" ? 0.55 : 1);
      }

      if (mode === 0 || mode === 3) {
        // 散開 / 漂い: ホームとノイズへ
        const homePull = mode === 3 ? 0.004 : 0.0015;
        ax += (p.homeX - p.x) * homePull;
        ay += (p.homeY - p.y) * homePull;
        ax += Math.sin(now * 0.0007 + p.phase) * 0.01;
        ay += Math.cos(now * 0.0009 + p.phase * 1.3) * 0.008;
      }

      if (p.kind === "bubble") {
        // 常にゆっくり上昇する傾向（海の記憶）
        ay -= 0.012;
        if (p.y < h * 0.55) {
          p.y = h * (0.92 + Math.random() * 0.06);
          p.x = clamp(p.x + (Math.random() - 0.5) * 80, 0, w);
          p.homeX = p.x;
          p.homeY = p.y;
        }
      }

      p.vx = clamp(p.vx * 0.96 + ax, -1.4, 1.4);
      p.vy = clamp(p.vy * 0.96 + ay, -1.2, 1.2);
      p.x += p.vx;
      p.y += p.vy;

      if (p.kind === "mote") {
        if (p.x < -20) p.x = w + 10;
        if (p.x > w + 20) p.x = -10;
        if (p.y < -20) p.y = h * 0.55;
        if (p.y > h * 0.62) p.y = 8;
      } else {
        p.x = clamp(p.x, -30, w + 30);
      }

      return flicker;
    };

    const draw = (now: number) => {
      if (!running) return;
      if (now > modeUntil) pickMode(now);
      moveAttractors(now);

      ctx.clearRect(0, 0, w, h);

      // 薄い導線: 集合の気配（皮下のネットワーク）
      if (mode === 1 || mode === 2) {
        ctx.save();
        ctx.globalAlpha = mode === 2 ? 0.06 : 0.09;
        ctx.strokeStyle = "rgba(103, 232, 249, 0.9)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i += 1) {
          const a = attractors[i];
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.radius * (0.55 + 0.15 * Math.sin(now * 0.001 + i)), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const p of particles) {
        const flicker = stepParticle(p, now);
        if (p.kind === "mote") {
          const alpha = 0.15 + flicker * 0.75;
          ctx.beginPath();
          ctx.fillStyle = `rgba(186, 242, 255, ${alpha})`;
          ctx.shadowColor = `rgba(34, 211, 238, ${0.35 + flicker * 0.45})`;
          ctx.shadowBlur = 6 + p.size * 2;
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          const alpha = 0.12 + flicker * 0.28;
          const r = p.size;
          const g = ctx.createRadialGradient(
            p.x - r * 0.25,
            p.y - r * 0.3,
            r * 0.1,
            p.x,
            p.y,
            r,
          );
          g.addColorStop(0, `rgba(255,255,255,${0.35 + flicker * 0.35})`);
          g.addColorStop(0.45, `rgba(103,232,249,${alpha})`);
          g.addColorStop(1, `rgba(14,116,144,${alpha * 0.25})`);
          ctx.beginPath();
          ctx.fillStyle = g;
          ctx.strokeStyle = `rgba(125, 211, 252, ${0.2 + flicker * 0.25})`;
          ctx.lineWidth = 1;
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    pickMode(performance.now());
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
