/**
 * コスト画面用のクライアントキャッシュ。
 * 開くたびに API / Cosmos を叩かず、直近スナップショットを即表示する。
 */
type CacheEnvelope<T> = {
  savedAt: number;
  payload: T;
};

const PREFIX = "aqua-costs:v1:";
/** 表示用に十分新しいとみなす時間 */
const FRESH_TTL_MS = 10 * 60 * 1000;
/** 裏更新失敗時も使い続ける上限 */
const STALE_TTL_MS = 6 * 60 * 60 * 1000;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function readCostsClientCache<T>(
  key: string,
  options?: { allowStale?: boolean },
): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.payload || typeof parsed.savedAt !== "number") return null;
    const age = Date.now() - parsed.savedAt;
    const ttl = options?.allowStale ? STALE_TTL_MS : FRESH_TTL_MS;
    if (age > ttl) {
      if (!options?.allowStale) return null;
      if (age > STALE_TTL_MS) {
        sessionStorage.removeItem(PREFIX + key);
        return null;
      }
    }
    return parsed.payload;
  } catch {
    return null;
  }
}

export function writeCostsClientCache<T>(key: string, payload: T): void {
  if (!canUseStorage()) return;
  try {
    const envelope: CacheEnvelope<T> = { savedAt: Date.now(), payload };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // quota / private mode
  }
}

export function costsDashboardCacheKey(month: string): string {
  return `dashboard:${month}`;
}

export function costsAzureCacheKey(month: string): string {
  return `azure:${month}`;
}

export function costsSolunaOpsCacheKey(month: string): string {
  return `soluna-ops:${month}`;
}
