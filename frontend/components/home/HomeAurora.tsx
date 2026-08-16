"use client";

import { useMobileProfile } from "@/lib/mobile-utils";

const FOLD_SPECS = [
  { variant: 1, width: 13, right: 0, sway: "normal" as const },
  { variant: 2, width: 11, right: 10, sway: "reverse" as const },
  { variant: 3, width: 12, right: 20, sway: "normal" as const },
  { variant: 4, width: 10, right: 31, sway: "reverse" as const },
  { variant: 2, width: 11, right: 40, sway: "normal" as const },
  { variant: 3, width: 10, right: 50, sway: "reverse" as const },
  { variant: 1, width: 9, right: 59, sway: "normal" as const },
];

export default function HomeAurora() {
  const { reducedMotion, liteMode, isMobile } = useMobileProfile();

  const folds = FOLD_SPECS.slice(0, liteMode || isMobile ? 5 : 7);

  if (reducedMotion) {
    return (
      <div className="aq-aurora aq-aurora--static" aria-hidden>
        <div className="aq-aurora__glow" />
        <div className="aq-aurora__rail">
          {folds.map((fold, i) => (
            <span
              key={i}
              className={`aq-aurora__fold aq-aurora__fold--${fold.variant}`}
              style={{
                right: `${fold.right}%`,
                width: `${fold.width}%`,
              }}
            />
          ))}
        </div>
        <div className="aq-aurora__veil" />
      </div>
    );
  }

  return (
    <div className="aq-aurora" aria-hidden>
      <div className="aq-aurora__glow" />
      <div className="aq-aurora__rail">
        {folds.map((fold, i) => (
          <span
            key={i}
            className={`aq-aurora__fold aq-aurora__fold--${fold.variant}${
              liteMode ? " aq-aurora__fold--lite" : ""
            }`}
            style={{
              right: `${fold.right}%`,
              width: `${fold.width}%`,
              animationDelay: `${-i * 1.6}s`,
              animationDuration: `${8.5 + (i % 3) * 2.2}s`,
              animationDirection: fold.sway,
            }}
          />
        ))}
      </div>
      {!liteMode && <div className="aq-aurora__shimmer" />}
      <div className="aq-aurora__veil" />
    </div>
  );
}
