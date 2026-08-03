"use client";

import { useMobileProfile } from "@/lib/mobile-utils";

export type BackgroundTheme = "portal" | "global" | "disney" | "costs" | "council" | "docs";

type AnimatedBackgroundProps = {
  theme: BackgroundTheme;
};

const PARTICLE_COUNT = { full: 16, mobile: 8, lite: 0 } as const;

export default function AnimatedBackground({ theme }: AnimatedBackgroundProps) {
  const { liteMode, isMobile, reducedMotion } = useMobileProfile();

  const particleCount = reducedMotion || liteMode
    ? isMobile
      ? PARTICLE_COUNT.lite
      : PARTICLE_COUNT.lite
    : isMobile
      ? PARTICLE_COUNT.mobile
      : PARTICLE_COUNT.full;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-mesh-${theme}`}
      data-theme={theme}
      aria-hidden
    >
      {!reducedMotion && (
        <>
          <div className="bg-aurora bg-aurora-a" />
          <div className="bg-aurora bg-aurora-b" />
          <div className="bg-aurora bg-aurora-c" />
          {!liteMode && <div className="bg-grid" />}
          {!liteMode && (
            <>
              <div className="bg-orbit bg-orbit-1" />
              <div className="bg-orbit bg-orbit-2" />
            </>
          )}
          {!isMobile && !liteMode && <div className="bg-orbit bg-orbit-3" />}
          {!liteMode && <div className="bg-scanline" />}
          {!liteMode && <div className="bg-meteor" />}
        </>
      )}

      {particleCount > 0 && (
        <div className="absolute inset-0">
          {Array.from({ length: particleCount }).map((_, i) => (
            <span
              key={i}
              className="bg-particle"
              style={{
                left: `${(i * 19 + 11) % 100}%`,
                top: `${(i * 27 + 13) % 100}%`,
                animationDelay: `${(i % 6) * 1.1}s`,
                animationDuration: `${5 + (i % 4)}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="bg-noise" />
    </div>
  );
}
