/**
 * RSS/Atom 取得の共通ヘルパ。
 * 503/429 等の一時障害はリトライし、恒久失敗は呼び出し側で代替フィードへ。
 */

const DEFAULT_TIMEOUT_MS = 12_000;
const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export type FetchRssXmlResult =
  | { ok: true; xml: string; status: number; attempts: number }
  | { ok: false; status?: number; reason: string; attempts: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchRssXml(
  feedUrl: string,
  options?: {
    userAgent?: string;
    timeoutMs?: number;
    maxAttempts?: number;
  },
): Promise<FetchRssXmlResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS;
  const userAgent =
    options?.userAgent ?? "AquaWorksNewsSearch/1.1 (+https://www.aquacore.net)";

  let lastStatus: number | undefined;
  let lastReason = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(feedUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "Accept-Language": "ja,en;q=0.8",
        },
      });
      lastStatus = res.status;
      if (res.ok) {
        const xml = await res.text();
        if (!xml.trim()) {
          lastReason = "RSS HTTP 200 but empty body";
        } else {
          return { ok: true, xml, status: res.status, attempts: attempt };
        }
      } else {
        lastReason = `RSS HTTP ${res.status}`;
        if (!RETRYABLE.has(res.status) || attempt >= maxAttempts) {
          return {
            ok: false,
            status: res.status,
            reason: lastReason,
            attempts: attempt,
          };
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      lastReason = msg.includes("abort") ? "RSS timeout" : `RSS fetch failed: ${msg}`;
      if (attempt >= maxAttempts) {
        return { ok: false, status: lastStatus, reason: lastReason, attempts: attempt };
      }
    } finally {
      clearTimeout(timeout);
    }
    // 503/429: 0.6s, 1.5s
    await sleep(400 + attempt * 550);
  }

  return {
    ok: false,
    status: lastStatus,
    reason: lastReason,
    attempts: maxAttempts,
  };
}
