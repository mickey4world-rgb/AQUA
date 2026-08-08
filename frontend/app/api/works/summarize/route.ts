import { withApiAccessLog } from "@/lib/server/api-access";
import { clampHistory, parseJsonBody, sanitizeText } from "@/lib/server/security";
import { summarizeWorksConsult } from "@/lib/server/works-consult";
import type { WorksChatMessage } from "@/lib/types/works";

type SummarizeRequestBody = {
  history?: WorksChatMessage[];
  topic?: string;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<SummarizeRequestBody>(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = await summarizeWorksConsult(
      auth.userId,
      clampHistory(Array.isArray(body.history) ? body.history : [], 12),
      sanitizeText(typeof body.topic === "string" ? body.topic : "", 32),
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({ draft: result.draft, model: result.model });
  });
}
