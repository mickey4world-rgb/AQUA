"use client";

import type { SolunaCharacter, SolunaGrowthStage } from "@/lib/types/soluna";

export type SolunaAvatarMood = "idle" | "thinking" | "speaking";

type SolunaCharacterAvatarProps = {
  character: SolunaCharacter;
  stage: SolunaGrowthStage;
  mood?: SolunaAvatarMood;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-[4.5rem] w-[4.5rem]",
} as const;

export default function SolunaCharacterAvatar({
  character,
  stage,
  mood = "idle",
  size = "md",
}: SolunaCharacterAvatarProps) {
  const stageClass = `soluna-avatar--${character}-${stage.id}`;
  const moodClass =
    mood === "thinking"
      ? "soluna-avatar--thinking"
      : mood === "speaking"
        ? "soluna-avatar--speaking"
        : "";

  const expression =
    mood === "thinking" ? "💭" : mood === "speaking" ? (character === "sol" ? "☀️" : "🌙") : null;

  return (
    <div
      className={`soluna-avatar ${stageClass} ${moodClass} relative flex shrink-0 items-center justify-center rounded-2xl ${SIZE_CLASS[size]}`}
      aria-hidden
    >
      {expression ? (
        <span className="soluna-avatar__expression absolute -right-1 -top-1 text-[10px] leading-none">
          {expression}
        </span>
      ) : null}
      {character === "sol" ? (
        <svg viewBox="0 0 64 64" className="soluna-avatar__svg h-[72%] w-[72%]">
          <circle className="soluna-avatar__sol-core" cx="32" cy="32" r="14" />
          <g className="soluna-avatar__sol-rays">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="32"
                y1="8"
                x2="32"
                y2="14"
                transform={`rotate(${deg} 32 32)`}
                className="soluna-avatar__sol-ray"
              />
            ))}
          </g>
          <circle className="soluna-avatar__sol-corona" cx="32" cy="32" r="22" />
        </svg>
      ) : (
        <svg viewBox="0 0 64 64" className="soluna-avatar__svg h-[72%] w-[72%]">
          <circle className="soluna-avatar__luna-halo" cx="32" cy="32" r="26" />
          <path
            className="soluna-avatar__luna-body"
            d="M32 12c-8 0-14 6.5-14 14.5 0 8 6 14.5 14 14.5 7 0 12.5-4.5 13.5-10.5-3.5 2.5-8 4-13 4-9.5 0-17-7.5-17-17S22.5 12 32 12z"
          />
          <circle className="soluna-avatar__luna-spark" cx="44" cy="22" r="1.5" />
        </svg>
      )}
    </div>
  );
}
