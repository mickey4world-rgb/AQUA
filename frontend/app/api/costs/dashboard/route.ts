import { isCosmosConfigured } from "@/lib/server/cosmos";
import { buildCostDashboard } from "@/lib/server/analytics";
import { withApiAccessLog } from "@/lib/server/api-access";

export async function GET(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const dashboard = await buildCostDashboard(auth.userId, month);
    return Response.json(dashboard);
  });
}
