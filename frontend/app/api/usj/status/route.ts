import { withApiAccessLog } from "@/lib/server/api-access";
import { buildUsjCrowdStatus } from "@/lib/server/usj-analysis";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    try {
      const status = await buildUsjCrowdStatus();
      return Response.json({
        usj: status,
        overallCrowdLevel: status.crowdLevel,
        overallLabel: status.crowdLabel,
        fetchedAt: status.fetchedAt,
      });
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "USJ状況の取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
