import { withApiAccessLog } from "@/lib/server/api-access";
import { clampHistory, parseJsonBody, sanitizeText } from "@/lib/server/security";
import {
  answerSecurityStatusChat,
  type SecurityChatTurn,
} from "@/lib/server/security-status-chat";
import { isGeminiConfigured } from "@/lib/server/gemini";

type Body = {
  message?: string;
  history?: SecurityChatTurn[];
  month?: string;
};

/** GET: チャット可否。POST: 最新セキュリティ状況を根拠に回答 */
export async function GET(request: Request) {
  return withApiAccessLog(request, async () =>
    Response.json({
      configured: isGeminiConfigured(),
      hint: "質問のたびに最新の診断・攻撃集計・部品一覧を読み直して答えます。",
    }),
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

    const body = parseJsonBody<Body>(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const history = clampHistory(
      Array.isArray(body.history) ? body.history : [],
      8,
    ) as SecurityChatTurn[];

    const result = await answerSecurityStatusChat({
      userId: auth.userId,
      message: typeof body.message === "string" ? body.message : "",
      history,
      month: sanitizeText(typeof body.month === "string" ? body.month : "", 7),
    });

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      reply: result.reply,
      model: result.model,
      askedAt: result.askedAt,
      snapshot: result.snapshot,
    });
  });
}
