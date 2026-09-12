import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { parseJsonBody, sanitizeText } from "@/lib/server/security";
import {
  getRelationWorkspace,
  saveRelationWorkspace,
} from "@/lib/server/work-relations";
import {
  mergeParsedIntoWorkspace,
  parseRelationMemo,
} from "@/lib/server/work-relations-ai";

export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json(
      { error: "ServiceUnavailable", message: "Cosmos DB が未設定です" },
      { status: 503 },
    );
  }

  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<{ memo?: string; apply?: boolean }>(raw);
    const memo = sanitizeText(typeof body?.memo === "string" ? body.memo : "", 8000);
    if (!memo) {
      return Response.json({ error: "メモが空です" }, { status: 400 });
    }

    const workspace = await getRelationWorkspace(auth.userId);
    const parsed = await parseRelationMemo(auth.userId, memo, workspace);
    if (!parsed.ok) {
      return Response.json({ error: parsed.reason }, { status: 400 });
    }

    if (body?.apply) {
      const merged = mergeParsedIntoWorkspace(workspace, parsed.result);
      const saved = await saveRelationWorkspace(auth.userId, merged);
      return Response.json({
        applied: true,
        workspace: saved,
        result: parsed.result,
        model: parsed.model,
        dataRegion: parsed.dataRegion,
      });
    }

    return Response.json({
      applied: false,
      result: parsed.result,
      model: parsed.model,
      dataRegion: parsed.dataRegion,
    });
  });
}
