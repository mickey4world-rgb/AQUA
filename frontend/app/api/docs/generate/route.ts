import { withApiAccessLog } from "@/lib/server/api-access";
import { runDocsGenerate } from "@/lib/server/docs-generate";
import type { DocOutline, DocsChatMessage } from "@/lib/types/docs";

type GenerateBody = {
  message?: string;
  history?: unknown;
  outline?: DocOutline | null;
  attachments?: unknown;
};

function parseHistory(raw: unknown): DocsChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is DocsChatMessage =>
      Boolean(m) &&
      typeof m === "object" &&
      (m as DocsChatMessage).role !== undefined &&
      ((m as DocsChatMessage).role === "user" ||
        (m as DocsChatMessage).role === "assistant") &&
      typeof (m as DocsChatMessage).content === "string",
  );
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: GenerateBody;
    try {
      body = (await request.json()) as GenerateBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const result = await runDocsGenerate(
      auth.userId,
      body.message ?? "",
      parseHistory(body.history),
      body.outline ?? null,
      body.attachments ?? null,
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    const { ok: _ok, ...payload } = result;
    return Response.json(payload);
  });
}
