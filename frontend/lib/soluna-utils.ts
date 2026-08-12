import {
  SOLUNA_LUNA_STAGES,
  SOLUNA_SOL_STAGES,
  type SolunaCharacter,
  type SolunaGrowthStage,
} from "@/lib/types/soluna";

export function clampIntimacy(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function resolveGrowthStage(
  character: SolunaCharacter,
  intimacy: number,
): SolunaGrowthStage {
  const stages = character === "sol" ? SOLUNA_SOL_STAGES : SOLUNA_LUNA_STAGES;
  const clamped = clampIntimacy(intimacy);
  return (
    stages.find((stage) => clamped >= stage.min && clamped <= stage.max) ??
    stages[0]
  );
}

export function intimacyProgress(intimacy: number, stage: SolunaGrowthStage): number {
  const span = stage.max - stage.min + 1;
  const offset = clampIntimacy(intimacy) - stage.min;
  return Math.max(0, Math.min(100, Math.round((offset / span) * 100)));
}

export function estimateIntimacyGain(messageLength: number): number {
  if (messageLength < 20) return 1;
  if (messageLength < 120) return 2;
  return 3;
}
