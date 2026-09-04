import { getDisneyShowcaseSnapshot } from "@/lib/server/disney-showcase-cache";

/** ビルド時プレビュー生成を避ける。実行時 Cache-Control / Cosmos キャッシュ。 */
export const dynamic = "force-dynamic";

/** 認証不要・他アプリ API と分離した公開 TDR プレビュー */
export async function GET() {
  try {
    const payload = await getDisneyShowcaseSnapshot();
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "X-TDR-Preview": "public",
      },
    });
  } catch (error) {
    console.error("[tdr-preview]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "混雑予測の取得に失敗しました",
      },
      { status: 503 },
    );
  }
}
