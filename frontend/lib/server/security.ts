/** OWASP 対策用 — API 入力検証・サニタイズ */

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeText(input: string, maxLen: number): string {
  return input.replace(CONTROL_CHARS, "").trim().slice(0, maxLen);
}

export function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidMonthStr(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function clampHistory<T>(items: T[] | undefined, max: number): T[] {
  if (!Array.isArray(items)) return [];
  return items.slice(-max);
}

export function parseJsonBody<T extends Record<string, unknown>>(
  raw: unknown,
): T | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as T;
}
