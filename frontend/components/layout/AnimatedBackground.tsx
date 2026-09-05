"use client";

import LivingSwarmField from "@/components/layout/LivingSwarmField";
import { useMobileProfile } from "@/lib/mobile-utils";

export type BackgroundTheme =
  | "portal"
  | "global"
  | "disney"
  | "costs"
  | "council"
  | "soluna"
  | "docs"
  | "space"
  | "works";

type AnimatedBackgroundProps = {
  theme: BackgroundTheme;
};

const MOTE_COUNT = { full: 28, mobile: 14 } as const;
const BUBBLE_COUNT = { full: 16, mobile: 9 } as const;
const METEOR_COUNT = 3;

/** 疑似乱数（SSR/CSR で同じ並びになるよう index から決定） */
function moteStyle(i: number) {
  const sizeTier = i % 5;
  const size =
    sizeTier === 0 ? 5.5 : sizeTier === 1 ? 4 : sizeTier === 2 ? 2.5 : sizeTier === 3 ? 2 : 1.5;
  const glow = sizeTier <= 1 ? 0.7 : sizeTier === 2 ? 0.5 : 0.35;
  return {
    left: `${(i * 17 + 7) % 100}%`,
    top: `${(i * 29 + 11) % 55}%`,
    width: `${size}px`,
    height: `${size}px`,
    opacity: 0.2 + (i % 4) * 0.08,
    animationDelay: `${(i % 11) * 0.85}s`,
    animationDuration: `${5.5 + (i % 7) * 0.9}s`,
    boxShadow: `0 0 ${6 + size * 2}px rgb(var(--scene-2) / ${glow})`,
  } as const;
}

function bubbleStyle(i: number, isPortal: boolean) {
  // 中・小のみ（中央を塞ぐ大きな泡は出さない）
  const isMid = i % 3 !== 0;
  const size = isMid ? 36 + (i % 5) * 10 : 12 + (i % 5) * 5;

  // 海エリア寄りに散らす（左右に振って中央の占有を避ける）
  const lane = i % 2 === 0 ? (i * 9 + 4) % 38 : 58 + ((i * 11 + 6) % 36);
  const leftBase = isPortal ? lane : (i * 13 + 5) % 92;
  const drift = ((i % 7) - 3) * 14;
  const duration = isMid ? 20 + (i % 5) * 3 : 15 + (i % 6) * 2.2;
  const opacity = isMid ? 0.26 : 0.36;
  const glintDelay = `${(i * 2.7) % 11}s`;
  const riseDistance = isMid ? `${94 + (i % 4) * 5}vh` : `${84 + (i % 3) * 5}vh`;

  return {
    left: `${leftBase}%`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${-((i * 2.4) % duration)}s`,
    animationDuration: `${duration}s`,
    ["--bubble-opacity" as string]: String(opacity),
    ["--drift-x" as string]: `${drift}px`,
    ["--glint-delay" as string]: glintDelay,
    ["--rise-distance" as string]: riseDistance,
  } as const;
}

function meteorStyle(i: number) {
  const duration = METEOR_COUNT * 10;
  const stagger = duration / METEOR_COUNT;
  return {
    top: `${6 + (i % 3) * 9}%`,
    right: `${4 + (i % 3) * 14}%`,
    // 正の delay だと待機中に静止表示されるため、周期内でずらす
    animationDelay: `${-(i * stagger)}s`,
    animationDuration: `${duration}s`,
  } as const;
}

export default function AnimatedBackground({ theme }: AnimatedBackgroundProps) {
  const { liteMode, isMobile, reducedMotion } = useMobileProfile();

  const showMotes = !reducedMotion && !liteMode;
  const moteCount = isMobile ? MOTE_COUNT.mobile : MOTE_COUNT.full;
  const showBubbles = theme === "portal" && !reducedMotion;
  const showMeteors = theme === "portal" && !reducedMotion && !liteMode;
  const bubbleCount = liteMode || isMobile ? BUBBLE_COUNT.mobile : BUBBLE_COUNT.full;

  /** トップ（portal）は光粒・泡を集合体として泳がせる。軽量端末は従来CSS。 */
  const useLivingSwarm = theme === "portal" && showMotes && showBubbles && !liteMode;

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

      {showMeteors && (
        <div className="aq-meteors">
          {Array.from({ length: METEOR_COUNT }).map((_, i) => (
            <span key={`meteor-${i}`} className="aq-meteor" style={meteorStyle(i)} />
          ))}
        </div>
      )}

      {/* 水 */}
      <div className="aq-water" />
      {!liteMode && <div className="aq-shimmer" />}

      {useLivingSwarm ? (
        <LivingSwarmField moteCount={moteCount} bubbleCount={bubbleCount} />
      ) : (
        <>
          {showBubbles && (
            <div className="aq-bubbles">
              {Array.from({ length: bubbleCount }).map((_, i) => (
                <span
                  key={`bubble-${i}`}
                  className={`aq-bubble ${i % 3 !== 0 ? "aq-bubble--md" : "aq-bubble--sm"}${
                    i % 4 === 1 || i % 5 === 0 ? " aq-bubble--glint" : ""
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
        </>
      )}

      <div className="bg-noise" />
    </div>
  );
}
