import { withApiAccessLog } from "@/lib/server/api-access";
import { analyzeApodEntry } from "@/lib/server/nasa-apod";
import { sendSpaceChat } from "@/lib/server/space-chat";
import type { ApodEntry, SpaceChatMessage } from "@/lib/types/space";

type ChatBody = {
  message?: string;
  history?: unknown;
  apod?: ApodEntry;
};

function parseHistory(raw: unknown): SpaceChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is SpaceChatMessage =>
      Boolean(m) &&
      typeof m === "object" &&
      ((m as SpaceChatMessage).role === "user" ||
        (m as SpaceChatMessage).role === "assistant") &&
      typeof (m as SpaceChatMessage).content === "string",
  );
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: ChatBody;
    try {
      body = (await request.json()) as ChatBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.apod?.title || !body.apod.explanation) {
      return Response.json({ error: "画像データが不足しています。" }, { status: 400 });
    }

    const analysis = analyzeApodEntry(body.apod);
    const result = await sendSpaceChat(
      auth.userId,
      body.message ?? "",
      body.apod,
      analysis,
      parseHistory(body.history),
    );

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({ reply: result.reply, model: result.model });
  });
}
