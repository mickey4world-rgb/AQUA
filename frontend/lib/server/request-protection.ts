import { createHash } from "crypto";
import { recordSecurityEvent } from "@/lib/server/security-event";

type RateBucket = {
  count: number;
  resetAt: number;
};

type RateLimitPolicy = {
  scope: string;
  maxRequests: number;
  windowMs: number;
  maxBodyBytes?: number;
};

const buckets = new Map<string, RateBucket>();
const MAX_BUCKETS = 5000;

function sourceKey(request: Request): string {
  const forwarded = request.headers.get("x-azure-clientip")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("cf-connecting-ip")
    ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return createHash("sha256")
    .update(`${forwarded.slice(0, 256)}:${userAgent.slice(0, 128)}`)
    .digest("hex")
    .slice(0, 24);
}

function cleanExpiredBuckets(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

export async function enforcePublicRequestProtection(
  request: Request,
  policy: RateLimitPolicy,
): Promise<Response | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    policy.maxBodyBytes != null
    && Number.isFinite(contentLength)
    && contentLength > policy.maxBodyBytes
  ) {
    await recordSecurityEvent({
      request,
      eventType: "invalid_request",
      severity: "medium",
      statusCode: 413,
      attackLabel: "過大リクエスト",
      reason: `Content-Length が上限 ${policy.maxBodyBytes} bytes を超過`,
      mitigation: "リクエストサイズ上限で処理前に遮断",
    });
    return Response.json({ error: "PayloadTooLarge" }, { status: 413 });
  }

  const now = Date.now();
  cleanExpiredBuckets(now);
  const key = `${policy.scope}:${sourceKey(request)}`;
  const current = buckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + policy.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= policy.maxRequests) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  await recordSecurityEvent({
    request,
    eventType: "rate_limited",
    severity: "medium",
    statusCode: 429,
    attackLabel: "短時間の過剰アクセス",
    reason: `${policy.scope} で ${policy.windowMs / 1000}秒あたり ${policy.maxRequests}回を超過`,
    mitigation: "アプリケーションレート制限で遮断",
  });
  return Response.json(
    { error: "TooManyRequests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}
