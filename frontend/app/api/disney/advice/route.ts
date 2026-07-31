import { requireAuth } from "@/lib/server/auth";
import { buildDisneyAdvice } from "@/lib/server/disney-analysis";
import { enhanceDisneyAdviceWithAi } from "@/lib/server/disney-ai-advice";
import type { DisneyParkKey } from "@/lib/types/disney";

export async function GET(request: Request) {
  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
  const withAi = searchParams.get("ai") === "1";

  if (park !== "tdl" && park !== "tds") {
    return Response.json({ error: "Invalid park" }, { status: 400 });
  }

  try {
    let advice = await buildDisneyAdvice(park);
    if (withAi) {
      advice = await enhanceDisneyAdviceWithAi(advice, auth.userId);
    }
    return Response.json(advice);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "アドバイスの取得に失敗しました",
      },
      { status: 502 },
    );
  }
}
