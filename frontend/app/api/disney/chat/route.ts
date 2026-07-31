import { withApiAccessLog } from "@/lib/server/api-access";
import { sendDisneyChat } from "@/lib/server/disney-chat";
import type { DisneyChatMessage } from "@/lib/types/disney";
import type { DisneyParkKey } from "@/lib/types/disney";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ChatRequestBody = {
  park?: DisneyParkKey;
  date?: string;
  message?: string;
  history?: DisneyChatMessage[];
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: ChatRequestBody;
    try {
      body = (await request.json()) as ChatRequestBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const park = body.park ?? "tdl";
    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }

    const date = body.date;
    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    const message = body.message ?? "";
    const history = Array.isArray(body.history) ? body.history : [];

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
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      reply: result.reply,
      model: result.model,
    });
  });
}
