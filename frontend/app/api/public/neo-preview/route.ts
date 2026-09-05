import { getNeoPublicPreview } from "@/lib/server/neo-public-preview";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

/** ビルド時に NASA API を叩かない。実行時 Cache-Control でキャッシュ。 */
export const dynamic = "force-dynamic";

/** 認証不要 · 当日最接近小惑星の公開プレビュー */
export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-neo-preview",
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const payload = await getNeoPublicPreview();
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "X-Neo-Preview": "public",
      },
    });
  } catch (error) {
    console.error("[neo-preview]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "小惑星プレビューの取得に失敗しました",
      },
      { status: 503 },
    );
  }
}
