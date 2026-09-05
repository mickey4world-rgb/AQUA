import { getDisneyShowcaseSnapshot } from "@/lib/server/disney-showcase-cache";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

/** 事前生成スナップショットのみ返す。オンライン再計算しない。 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-tdr-preview",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const payload = await getDisneyShowcaseSnapshot();
    if (!payload) {
      return Response.json(
        {
          error:
            "TDR公開データの準備中です。しばらくしてから再読み込みしてください。",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "60",
            "X-TDR-Preview": "missing-snapshot",
          },
        },
      );
    }

    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "X-TDR-Preview": "snapshot",
      },
    });
  } catch (error) {
    console.error("[tdr-preview]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "混雑予測の取得に失敗しました",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
