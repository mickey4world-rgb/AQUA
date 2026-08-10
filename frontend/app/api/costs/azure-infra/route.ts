import { withApiAccessLog } from "@/lib/server/api-access";
import { fetchAzureInfraCosts } from "@/lib/server/azure-cost-management";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const azure = await fetchAzureInfraCosts(month);

    return Response.json(azure, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      },
    });
  });
}
