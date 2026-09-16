import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import {
  addTravelJournalEntry,
  isTravelStoreConfigured,
} from "@/lib/server/travel-store";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    let body: { body?: string; stopId?: string; photoDataUrl?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const text = sanitizeText(body.body ?? "", 2000);
    if (!text && !body.photoDataUrl) {
      return Response.json({ error: "コメントまたは写真が必要です" }, { status: 400 });
    }

    try {
      const trip = await addTravelJournalEntry(auth.userId, id, {
        body: text || "（写真メモ）",
        stopId: body.stopId,
        photoDataUrl: body.photoDataUrl,
      });
      return Response.json({ trip }, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "保存に失敗しました" },
        { status: 422 },
      );
    }
  });
}
