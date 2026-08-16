"use client";

import SolunaCharacterAvatar, {
  type SolunaAvatarMood,
} from "@/components/soluna/SolunaCharacterAvatar";
import { intimacyProgress } from "@/lib/soluna-utils";
import type { SolunaCharacterState } from "@/lib/types/soluna";

const ACCENTS = {
  sol: {
    bar: "from-amber-400 to-orange-400",
    glow: "shadow-amber-400/25",
    panel: "border-amber-300/20 bg-amber-400/[0.06]",
    text: "text-amber-100",
  },
  luna: {
    bar: "from-indigo-400 to-violet-400",
    glow: "shadow-indigo-400/25",
    panel: "border-indigo-300/20 bg-indigo-400/[0.06]",
    text: "text-indigo-100",
  },
} as const;

type SolunaCharacterCardProps = {
  character: SolunaCharacterState;
  mood?: SolunaAvatarMood;
};

export default function SolunaCharacterCard({ character, mood = "idle" }: SolunaCharacterCardProps) {
  const accent = ACCENTS[character.character];
  const progress = intimacyProgress(character.intimacy, character.stage);

  return (
    <div className={`rounded-2xl border p-4 ${accent.panel} shadow-lg ${accent.glow}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SolunaCharacterAvatar
            character={character.character}
            stage={character.stage}
            mood={mood}
            size="lg"
          />
          <div>
            <p className="text-[10px] tracking-[0.22em] text-slate-400 uppercase">
              {character.provider === "gemini" ? "Gemini" : "Azure OpenAI"}
            </p>
            <h3 className="text-base font-semibold text-white">
              {character.nameJa}
              <span className="ml-1 text-sm font-normal text-slate-400">{character.name}</span>
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-xs font-medium ${accent.text}`}>{character.stage.label}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{character.intimacy}/100</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${accent.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          記憶 {character.memories.length} 件 · 会話 {character.interactions} 回
        </p>
      </div>
    </div>
  );
}
