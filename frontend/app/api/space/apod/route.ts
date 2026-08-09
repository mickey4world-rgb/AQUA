import { withApiAccessLog } from "@/lib/server/api-access";
import { analyzeApodEntry, fetchApodTimeline } from "@/lib/server/nasa-apod";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") ?? "10");

    const result = await fetchApodTimeline(days);
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 502 });
    }

    return Response.json(
      {
        entries: result.entries,
        days: result.days,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
        },
      },
    );
  });
}
