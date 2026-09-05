import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import { isSolunaStorageConfigured } from "@/lib/server/soluna-store";
import { sendSolunaChat } from "@/lib/server/soluna-chat";

/** SWA 実効上限より短く保ち、プラットフォーム殺到による HTTP 500 を避ける */
export const maxDuration = 30;

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

    try {
      const result = await sendSolunaChat(auth.userId, message, {
        voiceMode: body.voiceMode === true,
      });
      if (!result.ok) {
        // バリデーション等のみ。モデル失敗は sendSolunaChat 側で伴走返答に落とす
        return Response.json({ error: result.reason }, { status: 422 });
      }
      return Response.json(result.data);
    } catch (error) {
      // withApiAccessLog の汎用 500 に落とさず、再送を促す（二重 LLM 呼び出しはしない）
      console.error("[soluna/chat] unhandled", error);
      return Response.json(
        {
          error:
            "応答の取得に時間がかかりすぎました。もう一度送ってください。",
        },
        { status: 503 },
      );
    }
  });
}
