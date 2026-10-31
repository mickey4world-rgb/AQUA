/** cron / bridge 向け Bearer 秘密の照合（定数時間比較） */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** 長さの違いも漏らさないよう SHA-256 に揃えてから比較する */
export function secretEquals(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const a = provided?.trim();
  const b = expected?.trim();
  if (!a || !b) return false;
  return timingSafeEqual(digest(a), digest(b));
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

/**
 * Authorization: Bearer か、指定された代替ヘッダーのどちらかが
 * いずれかの秘密と一致すれば true。未設定の秘密は無視する。
 */
export function requestHasAutomationSecret(
  request: Request,
  secrets: ReadonlyArray<string | null | undefined>,
  altHeaders: readonly string[] = [],
): boolean {
  const configured = secrets.map((s) => s?.trim()).filter((s): s is string => Boolean(s));
  if (configured.length === 0) return false;
  const candidates = [
    readBearerToken(request),
    ...altHeaders.map((h) => request.headers.get(h)?.trim() ?? null),
  ].filter((c): c is string => Boolean(c));
  let ok = false;
  for (const candidate of candidates) {
    for (const secret of configured) {
      if (secretEquals(candidate, secret)) ok = true;
    }
  }
  return ok;
}
