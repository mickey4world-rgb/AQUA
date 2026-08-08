import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { deleteWorkNote } from "@/lib/server/work-notes";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const { id } = await context.params;
    const deleted = await deleteWorkNote(auth.userId, id);

    if (!deleted) {
      return Response.json({ error: "NotFound" }, { status: 404 });
    }

    return Response.json({ ok: true });
  });
}
