import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import { isSolunaStorageConfigured } from "@/lib/server/soluna-store";
import { sendSolunaChat } from "@/lib/server/soluna-chat";

export const maxDuration = 60;

type ChatRequestBody = {
  message?: string;
  voiceMode?: boolean;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isSolunaStorageConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため Soluna を利用できません。" },
        { status: 503 },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = raw as ChatRequestBody;
    const message = sanitizeText(typeof body.message === "string" ? body.message : "", 2000);

    const result = await sendSolunaChat(auth.userId, message, {
      voiceMode: body.voiceMode === true,
    });
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json(result.data);
  });
}
