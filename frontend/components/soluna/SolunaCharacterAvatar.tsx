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

/** /soluna/* は App ルートと衝突するため /images/soluna/ を使う */
const PORTRAIT = {
  sol: "/images/soluna/sol.jpg",
  luna: "/images/soluna/luna.jpg",
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PORTRAIT[character]}
        alt=""
        className="soluna-avatar__portrait h-full w-full object-cover object-top"
        loading={size === "lg" ? "eager" : "lazy"}
        decoding="async"
      />
      {expression ? (
        <span className="soluna-avatar__expression absolute -right-0.5 -top-0.5 text-[10px] leading-none">
          {expression}
        </span>
      ) : null}
    </div>
  );
}
