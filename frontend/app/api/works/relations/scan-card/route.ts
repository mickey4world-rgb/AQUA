import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { parseJsonBody } from "@/lib/server/security";
import { scanRelationBusinessCard } from "@/lib/server/work-relations-ai";

export const maxDuration = 60;

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

    const body = parseJsonBody<{ imageDataUrl?: string }>(raw);
    const imageDataUrl =
      typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
    if (!imageDataUrl) {
      return Response.json({ error: "画像がありません" }, { status: 400 });
    }

    const scanned = await scanRelationBusinessCard(auth.userId, imageDataUrl);
    if (!scanned.ok) {
      return Response.json({ error: scanned.reason }, { status: 400 });
    }

    return Response.json({
      result: scanned.result,
      model: scanned.model,
      dataRegion: scanned.dataRegion,
    });
  });
}
