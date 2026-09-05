import { getJstToday } from "@/lib/disney-holidays";
import { getDisneyShowcaseSnapshot } from "@/lib/server/disney-showcase-cache";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

/** キャッシュ優先。欠落時はローカル再生成して返す（空 503 を避ける）。 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-tdr-preview",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const payload = await getDisneyShowcaseSnapshot({ allowRebuild: true });
    if (!payload) {
      return Response.json(
        {
          error:
            "TDR公開データの準備中です。数十秒待ってから再読み込みしてください。",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "30",
            "X-TDR-Preview": "missing-snapshot",
          },
        },
      );
    }

    const fresh = payload.today === getJstToday();
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "X-TDR-Preview": fresh ? "snapshot" : "stale-snapshot",
      },
    });
  } catch (error) {
    console.error("[tdr-preview]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "混雑予測の取得に失敗しました",
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
