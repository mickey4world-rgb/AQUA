import { withApiAccessLog } from "@/lib/server/api-access";
import { sendDisneyChat } from "@/lib/server/disney-chat";
import { parseJsonBody, sanitizeText } from "@/lib/server/security";
import type { DisneyChatMessage } from "@/lib/types/disney";
import type { DisneyParkKey } from "@/lib/types/disney";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ChatRequestBody = {
  park?: DisneyParkKey;
  date?: string;
  message?: string;
  history?: DisneyChatMessage[];
  character?: string;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<ChatRequestBody>(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const park = body.park ?? "tdl";
    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }

    const date = body.date;
    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    const message = typeof body.message === "string" ? body.message : "";
    const history = Array.isArray(body.history) ? body.history : [];
    const character = typeof body.character === "string" ? body.character : "mickey";

    const result = await sendDisneyChat(
      auth.userId,
      park,
      message,
      history.filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      ),
      date,
      sanitizeText(character, 20),
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      reply: result.reply,
      model: result.model,
      character: result.character,
    });
  });
}
