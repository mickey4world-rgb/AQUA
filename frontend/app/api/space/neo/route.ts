import { withApiAccessLog } from "@/lib/server/api-access";
import { fetchCloseApproaches } from "@/lib/server/nasa-neo";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "25");

    const result = await fetchCloseApproaches(limit);
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 502 });
    }

    return Response.json({
      approaches: result.approaches,
      total: result.total,
    });
  });
}
