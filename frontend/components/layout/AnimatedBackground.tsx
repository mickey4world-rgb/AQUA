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

const MOTE_COUNT = { full: 14, mobile: 7 } as const;

export default function AnimatedBackground({ theme }: AnimatedBackgroundProps) {
  const { liteMode, isMobile, reducedMotion } = useMobileProfile();

  const showMotes = !reducedMotion && !liteMode;
  const moteCount = isMobile ? MOTE_COUNT.mobile : MOTE_COUNT.full;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-mesh-${theme}`}
      data-theme={theme}
      aria-hidden
    >
      {/* 宇宙 */}
      <div className="aq-stars aq-stars-far" />
      {!liteMode && <div className="aq-stars aq-stars-near" />}

      {/* 光 */}
      <div className="aq-nebula aq-nebula-a" />
      <div className="aq-nebula aq-nebula-b" />
      {!liteMode && <div className="aq-nebula aq-nebula-c" />}
      {!liteMode && <div className="aq-rays" />}

      {/* 水 */}
      <div className="aq-water" />
      {!liteMode && <div className="aq-shimmer" />}

      {showMotes && (
        <div className="absolute inset-0">
          {Array.from({ length: moteCount }).map((_, i) => (
            <span
              key={i}
              className="aq-mote"
              style={{
                left: `${(i * 23 + 9) % 100}%`,
                top: `${(i * 31 + 17) % 100}%`,
                animationDelay: `${(i % 7) * 1.3}s`,
                animationDuration: `${7 + (i % 5)}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="bg-noise" />
    </div>
  );
}
