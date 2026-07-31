import { requireAuth } from "@/lib/server/auth";
import { buildResortStatus } from "@/lib/server/disney-analysis";

export async function GET(request: Request) {
  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  try {
    const status = await buildResortStatus();
    return Response.json(status);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "混雑状況の取得に失敗しました",
      },
      { status: 502 },
    );
  }
}
