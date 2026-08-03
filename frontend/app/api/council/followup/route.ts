import { withApiAccessLog } from "@/lib/server/api-access";
import { normalizeAttachments } from "@/lib/server/council-attachments";
import { sendCouncilFollowUp } from "@/lib/server/council-followup";
import type { CouncilChatMessage, CouncilDebateResult } from "@/lib/types/council";

type FollowUpBody = {
  message?: string;
  debate?: CouncilDebateResult;
  history?: CouncilChatMessage[];
  attachments?: unknown;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: FollowUpBody;
    try {
      body = (await request.json()) as FollowUpBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.debate?.synthesis?.content) {
      return Response.json({ error: "合議結果がありません" }, { status: 400 });
    }

    const attachmentResult = normalizeAttachments(body.attachments ?? null);
    if (!attachmentResult.ok) {
      return Response.json({ error: attachmentResult.reason }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? body.history.filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
      : [];

    const result = await sendCouncilFollowUp(
      auth.userId,
      body.message ?? "",
      body.debate,
      history,
      attachmentResult.attachments,
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({ reply: result.reply, model: result.model });
  });
}
