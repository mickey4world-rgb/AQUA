/**
 * 繰り返し攻撃の自動ブロック判定（純粋関数）。
 * セッション切れの本人が数回 401 を受けても止まらず、
 * スキャナや総当たり（数十〜数百回）は止まる重み・閾値にしている。
 */
import type {
  SecurityEventSeverity,
  SecurityEventType,
} from "@/lib/types/security-event";

export const AUTOBLOCK_WINDOW_MS = 10 * 60 * 1000;
export const AUTOBLOCK_SCORE_THRESHOLD = 60;
export const AUTOBLOCK_FIRST_BLOCK_MS = 60 * 60 * 1000;
export const AUTOBLOCK_REPEAT_BLOCK_MS = 24 * 60 * 60 * 1000;

export function securityEventWeight(input: {
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  statusCode: number;
}): number {
  switch (input.eventType) {
    case "automation_auth_denied":
      return 5;
    case "auth_denied":
      // 403 = 許可リスト外の他人アカウント。401 = 未ログイン（本人のセッション切れも含む）
      return input.statusCode === 403 ? 5 : input.severity === "high" ? 4 : 1;
    case "rate_limited":
      return 2;
    case "invalid_request":
      return input.severity === "low" ? 0.5 : 2;
    case "auto_blocked":
      return 0;
    default:
      return 1;
  }
}

export type AutoBlockHit = { at: number; weight: number };

/** ウィンドウ外を落として合計スコアを返す（hits は破壊的に整理） */
export function slideAutoBlockScore(hits: AutoBlockHit[], now: number): number {
  const cutoff = now - AUTOBLOCK_WINDOW_MS;
  while (hits.length > 0 && hits[0].at < cutoff) hits.shift();
  return hits.reduce((sum, hit) => sum + hit.weight, 0);
}

export type AutoBlockDecision =
  | { block: false; score: number }
  | { block: true; score: number; durationMs: number; repeat: boolean };

export function decideAutoBlock(input: {
  score: number;
  /** 直近24時間に同じ送信元を一度ブロックしているか */
  blockedWithin24h: boolean;
}): AutoBlockDecision {
  if (input.score < AUTOBLOCK_SCORE_THRESHOLD) {
    return { block: false, score: input.score };
  }
  return {
    block: true,
    score: input.score,
    durationMs: input.blockedWithin24h ? AUTOBLOCK_REPEAT_BLOCK_MS : AUTOBLOCK_FIRST_BLOCK_MS,
    repeat: input.blockedWithin24h,
  };
}
