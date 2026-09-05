import { getWorksMoneyFlowPublicPreview } from "@/lib/server/gyosei-public-preview";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

/** 事前生成スナップショットのみ返す。リクエスト時の集計はしない。 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-works-money-flow",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  try {
    const payload = await getWorksMoneyFlowPublicPreview();
    if (!payload) {
      return Response.json(
        {
          error:
            "公開サンキーの表示用データがまだ準備されていません。しばらくしてから再読み込みしてください。",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "60",
            "X-Works-Preview": "missing-snapshot",
          },
        },
      );
    }

    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Works-Preview": "snapshot",
      },
    });
  } catch (error) {
    console.error("[works-money-flow/public]", error);
    return Response.json(
      { error: "行政事業レビューデータの取得に失敗しました" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
