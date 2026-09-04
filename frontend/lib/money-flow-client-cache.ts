import type { MoneyFlowResponse } from "@/lib/types/gyosei";

const PREFIX = "aqua-money-flow:v1:";
/** 同梱 CSV は静的なので、セッション内は長く使ってよい */
const CLIENT_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  savedAt: number;
  payload: T;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function readMoneyFlowCache<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.payload || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CLIENT_TTL_MS) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
}

export function writeMoneyFlowCache<T>(key: string, payload: T): void {
  if (!canUseStorage()) return;
  try {
    const envelope: CacheEnvelope<T> = { savedAt: Date.now(), payload };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // quota / private mode — ignore
  }
}

export function moneyFlowPublicCacheKey(): string {
  return "public-preview";
}

export function moneyFlowMetaCacheKey(): string {
  return "meta";
}

export function moneyFlowQueryCacheKey(parts: {
  year: number | string;
  ministry?: string;
  payee?: string;
  sector?: string;
  focusKind?: string;
  focusValue?: string;
}): string {
  return [
    "flow",
    parts.year,
    parts.ministry ?? "",
    parts.payee ?? "",
    parts.sector ?? "",
    parts.focusKind ?? "",
    parts.focusValue ?? "",
  ].join("|");
}

export type { MoneyFlowResponse };
