"use client";

import { useMobileProfile } from "@/lib/mobile-utils";

export type BackgroundTheme =
  | "portal"
  | "global"
  | "disney"
  | "costs"
  | "council"
  | "docs"
  | "space"
  | "works";

type AnimatedBackgroundProps = {
  theme: BackgroundTheme;
};

const MOTE_COUNT = { full: 42, mobile: 18 } as const;
const BUBBLE_COUNT = { full: 16, mobile: 8 } as const;

/** 疑似乱数（SSR/CSR で同じ並びになるよう index から決定） */
function moteStyle(i: number) {
  const sizeTier = i % 5;
  const size =
    sizeTier === 0 ? 5.5 : sizeTier === 1 ? 4 : sizeTier === 2 ? 2.5 : sizeTier === 3 ? 2 : 1.5;
  const glow = sizeTier <= 1 ? 0.7 : sizeTier === 2 ? 0.5 : 0.35;
  return {
    left: `${(i * 17 + 7) % 100}%`,
    top: `${(i * 29 + 11) % 100}%`,
    width: `${size}px`,
    height: `${size}px`,
    opacity: 0.2 + (i % 4) * 0.08,
    animationDelay: `${(i % 11) * 0.85}s`,
    animationDuration: `${5.5 + (i % 7) * 0.9}s`,
    boxShadow: `0 0 ${6 + size * 2}px rgb(var(--scene-2) / ${glow})`,
  } as const;
}

function bubbleStyle(i: number, isPortal: boolean) {
  const tier = i % 5;
  // 0: large, 1-2: mid, 3-4: small
  const size =
    tier === 0
      ? 140 + (i % 3) * 36
      : tier <= 2
        ? 48 + (i % 4) * 14
        : 14 + (i % 5) * 6;

  // タイトル側（左）に寄せる。portal は特に左寄せ
  const leftBase = isPortal ? (i * 11 + 3) % 58 : (i * 13 + 5) % 92;
  const drift = ((i % 7) - 3) * 18;
  const duration = tier === 0 ? 22 + (i % 4) * 4 : tier <= 2 ? 16 + (i % 5) * 2.5 : 11 + (i % 6) * 1.8;
  const opacity = tier === 0 ? 0.22 : tier <= 2 ? 0.28 : 0.38;

  return {
    left: `${leftBase}%`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${-((i * 2.4) % duration)}s`,
    animationDuration: `${duration}s`,
    ["--bubble-opacity" as string]: String(opacity),
    ["--drift-x" as string]: `${drift}px`,
  } as const;
}

export default function AnimatedBackground({ theme }: AnimatedBackgroundProps) {
  const { liteMode, isMobile, reducedMotion } = useMobileProfile();

  const showMotes = !reducedMotion && !liteMode;
  const moteCount = isMobile ? MOTE_COUNT.mobile : MOTE_COUNT.full;
  const showBubbles = theme === "portal" && !reducedMotion;
  const bubbleCount = liteMode || isMobile ? BUBBLE_COUNT.mobile : BUBBLE_COUNT.full;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-mesh-${theme}`}
      data-theme={theme}
      aria-hidden
    >
      {/* 宇宙 */}
      <div className="aq-stars aq-stars-far" />
      {!liteMode && <div className="aq-stars aq-stars-mid" />}
      {!liteMode && <div className="aq-stars aq-stars-near" />}

      {/* 光 */}
      <div className="aq-nebula aq-nebula-a" />
      <div className="aq-nebula aq-nebula-b" />
      {!liteMode && <div className="aq-nebula aq-nebula-c" />}
      {!liteMode && <div className="aq-rays" />}

      {/* 水 */}
      <div className="aq-water" />
      {!liteMode && <div className="aq-shimmer" />}

      {showBubbles && (
        <div className="aq-bubbles">
          {Array.from({ length: bubbleCount }).map((_, i) => (
            <span
              key={`bubble-${i}`}
              className={`aq-bubble ${
                i % 5 === 0 ? "aq-bubble--lg" : i % 5 <= 2 ? "aq-bubble--md" : "aq-bubble--sm"
              }`}
              style={bubbleStyle(i, true)}
            />
          ))}
        </div>
      )}

      {showMotes && (
        <div className="absolute inset-0">
          {Array.from({ length: moteCount }).map((_, i) => (
            <span key={i} className="aq-mote" style={moteStyle(i)} />
          ))}
        </div>
      )}

      <div className="bg-noise" />
    </div>
  );
}
