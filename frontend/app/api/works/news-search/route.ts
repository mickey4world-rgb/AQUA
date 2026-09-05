import { withApiAccessLog } from "@/lib/server/api-access";
import { clampHistory, parseJsonBody, sanitizeText } from "@/lib/server/security";
import {
  buildWorksNewsDigest,
  chatWorksNewsSearch,
  digestNeedsEnrichment,
  enrichWorksNewsDigestCategory,
} from "@/lib/server/works-news-search";
import { getLatestWorksNewsDigest } from "@/lib/server/works-news-search-store";
import {
  NEWS_SEARCH_CATEGORIES,
  type NewsSearchCategory,
  type NewsSearchChatMessage,
} from "@/lib/types/works-news-search";

export const maxDuration = 60;

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
    return Response.json({
      ok: true,
      digest,
      needsEnrichment: digestNeedsEnrichment(digest),
    });
  });
}

type ChatBody = {
  message?: string;
  history?: NewsSearchChatMessage[];
  itemId?: string;
};

function parseCategory(value: unknown): NewsSearchCategory | null {
  if (typeof value !== "string") return null;
  return (NEWS_SEARCH_CATEGORIES as readonly string[]).includes(value)
    ? (value as NewsSearchCategory)
    : null;
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<
      ChatBody & { action?: string; force?: boolean; category?: string }
    >(raw);
    if (!body) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.action === "enrich") {
      const category = parseCategory(body.category);
      if (!category) {
        return Response.json(
          { error: "category に ai / systems / economy / government を指定してください。" },
          { status: 400 },
        );
      }
      const enriched = await enrichWorksNewsDigestCategory(category);
      if (!enriched.ok) {
        return Response.json({ error: enriched.reason }, { status: 422 });
      }
      return Response.json({
        ok: true,
        digest: enriched.digest,
        category,
        enrichedCount: enriched.enrichedCount,
        needsEnrichment: digestNeedsEnrichment(enriched.digest),
      });
    }

    if (body.action === "rebuild") {
      const built = await buildWorksNewsDigest({ force: body.force === true });
      if (!built.ok) {
        return Response.json({ error: built.reason }, { status: 422 });
      }
      return Response.json({
        ok: true,
        digest: built.digest,
        needsEnrichment: digestNeedsEnrichment(built.digest),
      });
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
