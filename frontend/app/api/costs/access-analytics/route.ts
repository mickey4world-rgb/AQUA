import { buildAccessAnalyticsReport } from "@/lib/server/access-analytics";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { withApiAccessLog } from "@/lib/server/api-access";

export async function GET(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const report = await buildAccessAnalyticsReport(month);
    return Response.json(report, {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
      },
    });
  });
}
