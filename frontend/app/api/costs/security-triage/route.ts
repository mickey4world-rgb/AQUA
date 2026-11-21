import { isCosmosConfigured } from "@/lib/server/cosmos";
import { withApiAccessLog } from "@/lib/server/api-access";
import { mapSecurityTriageForClient } from "@/lib/server/security-analytics";
import { getSecurityTriageByDateJst } from "@/lib/server/security-triage";

/**
 * 過去の日次診断を履歴閲覧する。
 * GET /api/costs/security-triage?dateJst=YYYY-MM-DD
 */
export async function GET(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(
    request,
    async () => {
      const dateJst = new URL(request.url).searchParams.get("dateJst")?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateJst)) {
        return Response.json(
          { error: "BadRequest", message: "dateJst=YYYY-MM-DD が必要です" },
          { status: 400 },
        );
      }
      const triage = await getSecurityTriageByDateJst(dateJst);
      if (!triage) {
        return Response.json(
          { error: "NotFound", message: `${dateJst} の診断はありません` },
          { status: 404 },
        );
      }
      return Response.json(
        { triage: mapSecurityTriageForClient(triage) },
        {
          headers: {
            "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
          },
        },
      );
    },
    { skipAccessLog: true },
  );
}
