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

/** UI 用 — 直近 1 ターン（ユーザー + ソル + ルーナ）のみ */
export function getLatestExchange<T extends { role: string }>(messages: T[]): T[] {
  if (messages.length === 0) return [];

  let userIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      userIndex = i;
      break;
    }
  }

  if (userIndex === -1) return messages.slice(-3);

  const round: T[] = [messages[userIndex]];
  for (let i = userIndex + 1; i < messages.length; i += 1) {
    if (messages[i].role === "user") break;
    round.push(messages[i]);
  }
  return round;
}
