import { withApiAccessLog } from "@/lib/server/api-access";
import { loadJudicialSampleDocuments, JUDICIAL_SAMPLE_CASE } from "@/data/judicial/samples";
import {
  getJudicialProvidersStatus,
  sendJudicialCaseChat,
} from "@/lib/server/judicial-case-chat";
import { parseJsonBody } from "@/lib/server/security";
import type {
  JudicialAiProvider,
  JudicialCaseChatRequest,
  JudicialChatMessage,
} from "@/lib/types/judicial-case";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("samples") === "1") {
      return Response.json({
        case: JUDICIAL_SAMPLE_CASE,
        documents: loadJudicialSampleDocuments(),
      });
    }
    return Response.json({ providers: getJudicialProvidersStatus() });
  });
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<JudicialCaseChatRequest>(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? (body.history as JudicialChatMessage[])
      : [];

    const provider: JudicialAiProvider =
      body.provider === "openai" ? "openai" : "gemini";

    const result = await sendJudicialCaseChat(auth.userId, {
      message: typeof body.message === "string" ? body.message : "",
      history,
      documents: Array.isArray(body.documents) ? body.documents : [],
      provider,
    });

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      reply: result.reply,
      model: result.model,
      provider: result.provider,
      notice: result.notice,
    });
  });
}
