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

export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return new Response(null, { status: 204 });
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
