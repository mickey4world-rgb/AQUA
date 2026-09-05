import { withApiAccessLog } from "@/lib/server/api-access";
import { clampHistory, parseJsonBody, sanitizeText } from "@/lib/server/security";
import {
  buildWorksNewsDigest,
  chatWorksNewsSearch,
} from "@/lib/server/works-news-search";
import { getLatestWorksNewsDigest } from "@/lib/server/works-news-search-store";
import type { NewsSearchChatMessage } from "@/lib/types/works-news-search";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const digest = await getLatestWorksNewsDigest();
    if (!digest) {
      return Response.json(
        {
          ok: false,
          digest: null,
          error: "ニュースサーチ結果がまだありません。深夜の自動取得後に表示されます。",
        },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, digest });
  });
}

type ChatBody = {
  message?: string;
  history?: NewsSearchChatMessage[];
  itemId?: string;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<ChatBody & { action?: string; force?: boolean }>(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.action === "rebuild") {
      // 手動再取得は認証ユーザーのみ（cron は別ルート）
      const built = await buildWorksNewsDigest({ force: body.force === true });
      if (!built.ok) {
        return Response.json({ error: built.reason }, { status: 422 });
      }
      return Response.json({ ok: true, digest: built.digest });
    }

    const history = clampHistory(
      Array.isArray(body.history) ? body.history : [],
      10,
    ) as NewsSearchChatMessage[];

    const itemIdRaw = typeof body.itemId === "string" ? body.itemId.trim() : "";
    const result = await chatWorksNewsSearch({
      userId: auth.userId,
      message: typeof body.message === "string" ? body.message : "",
      history,
      itemId: itemIdRaw ? sanitizeText(itemIdRaw, 40) : undefined,
    });

    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      reply: result.reply,
      model: result.model,
    });
  });
}
