import { extractGeoFromHeaders } from "@/lib/client-hints";
import { isPublicTrackablePath } from "@/lib/public-pages";
import { recordPageView } from "@/lib/server/page-view-log";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";
import { recordSecurityEvent } from "@/lib/server/security-event";

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

  const blocked = await enforcePublicRequestProtection(request, {
    scope: "analytics-pageview",
    maxRequests: 30,
    windowMs: 60_000,
    maxBodyBytes: 16_384,
  });
  if (blocked) return blocked;

  let body: PageViewBody;
  try {
    body = (await request.json()) as PageViewBody;
  } catch {
    await recordSecurityEvent({
      request,
      eventType: "invalid_request",
      severity: "low",
      statusCode: 400,
      attackLabel: "不正なJSON",
      reason: "ページビューAPIへ解析不能なJSONを送信",
      mitigation: "入力検証で保存前に拒否",
    });
    return Response.json({ error: "InvalidJSON" }, { status: 400 });
  }

  const pathname = body.pathname?.trim();
  const visitorKey = body.visitorKey?.trim();

  if (!pathname || !visitorKey || !isPublicTrackablePath(pathname)) {
    await recordSecurityEvent({
      request,
      eventType: "invalid_request",
      severity: "low",
      statusCode: 400,
      attackLabel: "許可外の計測リクエスト",
      reason: "必須項目不足または公開対象外パス",
      mitigation: "公開ページ許可リストで拒否",
    });
    return Response.json({ error: "InvalidRequest" }, { status: 400 });
  }

  if (visitorKey.length > 128) {
    await recordSecurityEvent({
      request,
      eventType: "invalid_request",
      severity: "low",
      statusCode: 400,
      attackLabel: "過大な訪問者識別子",
      reason: "visitorKeyが128文字を超過",
      mitigation: "入力長制限で拒否",
    });
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
