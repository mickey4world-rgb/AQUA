import {
  digestNeedsEnrichment,
  withEnrichmentMeta,
} from "@/lib/server/works-news-search";
import { getLatestWorksNewsDigest } from "@/lib/server/works-news-search-store";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

/** バッチ取得済みダイジェストの読み取り専用公開。チャット／再生成は含まない。 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-works-news-search",
    maxRequests: 90,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const raw = await getLatestWorksNewsDigest();
    if (!raw) {
      return Response.json(
        {
          ok: false,
          digest: null,
          error:
            "ニュースサーチの公開ダイジェストがまだありません。深夜バッチ後に表示されます。",
        },
        {
          status: 404,
          headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
        },
      );
    }

    const digest = withEnrichmentMeta(raw);
    return Response.json(
      {
        ok: true,
        digest,
        needsEnrichment: digestNeedsEnrichment(digest),
        enrichmentStatus: digest.enrichmentStatus,
        chatAvailable: false,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
          "X-Works-News-Search": "public-digest",
        },
      },
    );
  } catch (error) {
    console.error("[public/works-news-search]", error);
    return Response.json(
      { ok: false, error: "ニュースサーチ公開データの取得に失敗しました。" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
