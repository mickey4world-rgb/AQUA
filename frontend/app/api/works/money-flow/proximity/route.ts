import { queryLifeProximity } from "@/lib/server/gyosei-life-proximity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
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
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("[works-money-flow/proximity]", error);
    return Response.json(
      { error: "生活接点マップの取得に失敗しました" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
