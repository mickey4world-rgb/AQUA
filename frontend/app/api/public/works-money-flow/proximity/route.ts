import { queryLifeProximity } from "@/lib/server/gyosei-life-proximity";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-works-money-flow-proximity",
    maxRequests: 40,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const url = new URL(request.url);
    const yearRaw = url.searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : null;
    const prefecture = url.searchParams.get("prefecture") ?? "";
    const city = url.searchParams.get("city");

    const result = queryLifeProximity({
      year: Number.isFinite(year) ? year : null,
      prefecture,
      city,
    });

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        {
          status: result.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return Response.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[works-money-flow/proximity/public]", error);
    return Response.json(
      { error: "生活接点マップの取得に失敗しました" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
