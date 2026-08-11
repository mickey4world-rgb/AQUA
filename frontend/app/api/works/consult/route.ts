import { withApiAccessLog } from "@/lib/server/api-access";
import { clampHistory, parseJsonBody, sanitizeText } from "@/lib/server/security";
import { isGeminiConfigured } from "@/lib/server/gemini";
import { sendWorksConsult } from "@/lib/server/works-consult";
import type { WorksChatMessage } from "@/lib/types/works";

type ConsultRequestBody = {
  message?: string;
  history?: WorksChatMessage[];
  topic?: string;
};

export async function GET(request: Request) {
  return withApiAccessLog(request, async () =>
    Response.json({ configured: isGeminiConfigured() }),
  );
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<ConsultRequestBody>(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const history = clampHistory(
      Array.isArray(body.history) ? body.history : [],
      12,
    );

    const result = await sendWorksConsult(
      auth.userId,
      typeof body.message === "string" ? body.message : "",
      history,
      sanitizeText(typeof body.topic === "string" ? body.topic : "", 32),
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      reply: result.reply,
      visual: result.visual,
      model: result.model,
      freeTier: true,
    });
  });
}
