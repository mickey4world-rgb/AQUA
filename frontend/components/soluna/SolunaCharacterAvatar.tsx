"use client";

import Image from "next/image";
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

const PORTRAIT = {
  sol: "/soluna/sol.jpg",
  luna: "/soluna/luna.jpg",
} as const;

const PORTRAIT_SIZE = {
  sm: 40,
  md: 56,
  lg: 72,
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
      className={`soluna-avatar ${stageClass} ${moodClass} relative shrink-0 overflow-hidden rounded-2xl ${SIZE_CLASS[size]}`}
      aria-hidden
    >
      <Image
        src={PORTRAIT[character]}
        alt=""
        width={PORTRAIT_SIZE[size]}
        height={PORTRAIT_SIZE[size]}
        className="h-full w-full object-cover object-top"
        priority={size === "lg"}
      />
      {expression ? (
        <span className="soluna-avatar__expression absolute -right-0.5 -top-0.5 text-[10px] leading-none">
          {expression}
        </span>
      ) : null}
    </div>
  );
}
