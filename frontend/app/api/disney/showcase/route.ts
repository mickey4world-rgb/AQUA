import { getDisneyShowcaseSnapshot } from "@/lib/server/disney-showcase-cache";

/** ビルド時プレビュー生成を避ける。実行時 Cache-Control / Cosmos キャッシュ。 */
export const dynamic = "force-dynamic";

/** @deprecated 互換用。新規は /api/public/tdr-preview を使用 */
export async function GET() {
  try {
    const payload = await getDisneyShowcaseSnapshot();
    if (!payload) {
      return Response.json(
        { error: "TDR公開データの準備中です。" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "X-TDR-Preview": "legacy-snapshot",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "ショーケースデータの取得に失敗しました",
      },
      { status: 503 },
    );
  }
}
