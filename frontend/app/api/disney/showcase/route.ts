import { buildDisneyShowcaseSnapshot } from "@/lib/server/disney-public-preview";

export const revalidate = 3600;

export async function GET() {
  try {
    const payload = await buildDisneyShowcaseSnapshot();
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "ショーケースデータの取得に失敗しました",
      },
      { status: 502 },
    );
  }
}
