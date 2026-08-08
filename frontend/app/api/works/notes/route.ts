import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { parseJsonBody, sanitizeText } from "@/lib/server/security";
import { createWorkNote, listWorkNotes } from "@/lib/server/work-notes";
import type { WorkNoteDraft } from "@/lib/types/works";

type CreateNoteBody = {
  draft?: WorkNoteDraft;
  topic?: string;
  model?: string;
};

function unavailable() {
  return Response.json(
    { error: "ServiceUnavailable", message: "Cosmos DB が未設定です" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  if (!isCosmosConfigured()) return unavailable();

  return withApiAccessLog(request, async (auth) => {
    const notes = await listWorkNotes(auth.userId);
    return Response.json({ notes });
  });
}

export async function POST(request: Request) {
  if (!isCosmosConfigured()) return unavailable();

  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<CreateNoteBody>(raw);
    if (!body?.draft || typeof body.draft.title !== "string") {
      return Response.json({ error: "保存するまとめがありません" }, { status: 400 });
    }

    try {
      const note = await createWorkNote(
        auth.userId,
        body.draft,
        sanitizeText(typeof body.topic === "string" ? body.topic : "", 32),
        sanitizeText(typeof body.model === "string" ? body.model : "gemini", 60),
      );
      return Response.json({ note }, { status: 201 });
    } catch {
      return Response.json({ error: "メモの保存に失敗しました" }, { status: 500 });
    }
  });
}
