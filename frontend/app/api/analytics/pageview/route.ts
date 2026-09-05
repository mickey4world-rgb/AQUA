import { extractGeoFromHeaders } from "@/lib/client-hints";
import { isPublicTrackablePath } from "@/lib/public-pages";
import { recordPageView } from "@/lib/server/page-view-log";
import { isCosmosConfigured } from "@/lib/server/cosmos";

type PageViewBody = {
  pathname?: string;
  visitorKey?: string;
  referrer?: string | null;
  section?: string | null;
  language?: string | null;
  timezone?: string | null;
  screen?: string | null;
};

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function isRateLimited(request: Request): boolean {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = `${forwardedFor ?? "unknown"}:${request.headers.get("user-agent") ?? ""}`;
  const now = Date.now();
  const current = rateBuckets.get(clientKey);

  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(clientKey, { startedAt: now, count: 1 });
    if (rateBuckets.size > 2_000) {
      for (const [key, bucket] of rateBuckets) {
        if (now - bucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
      }
    }
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return new Response(null, { status: 204 });
  }

  if (isRateLimited(request)) {
    return Response.json(
      { error: "TooManyRequests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: PageViewBody;
  try {
    body = (await request.json()) as PageViewBody;
  } catch {
    return Response.json({ error: "InvalidJSON" }, { status: 400 });
  }

  const pathname = body.pathname?.trim();
  const visitorKey = body.visitorKey?.trim();

  if (!pathname || !visitorKey || !isPublicTrackablePath(pathname)) {
    return Response.json({ error: "InvalidRequest" }, { status: 400 });
  }

  if (visitorKey.length > 128) {
    return Response.json({ error: "InvalidRequest" }, { status: 400 });
  }

  const geo = extractGeoFromHeaders(request.headers);

  await recordPageView({
    pathname,
    visitorKey,
    referrer: body.referrer ?? null,
    userAgent: request.headers.get("user-agent"),
    section: body.section ?? null,
    language: body.language ?? null,
    timezone: body.timezone ?? null,
    screen: body.screen ?? null,
    acceptLanguage: request.headers.get("accept-language"),
    country: geo.country,
    region: geo.region,
    city: geo.city,
  });

  return new Response(null, { status: 204 });
}
