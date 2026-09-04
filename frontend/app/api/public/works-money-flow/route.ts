import { getWorksMoneyFlowPublicPreview } from "@/lib/server/gyosei-public-preview";

/** ビルド時に巨大な gyosei を展開しない。実行時 Cache-Control でキャッシュ。 */
export const dynamic = "force-dynamic";

/** 認証不要・行政事業レビューのサンキー公開プレビュー */
export async function GET() {
  try {
    const payload = await getWorksMoneyFlowPublicPreview();
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Works-Preview": "public",
      },
    });
  } catch (error) {
    console.error("[works-money-flow/public]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "行政事業レビューデータの取得に失敗しました",
      },
      { status: 503 },
    );
  }
}
