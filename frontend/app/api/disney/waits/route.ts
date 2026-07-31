import { requireAuth } from "@/lib/server/auth";
import { buildParkCrowdStatus, predictDailyCrowd } from "@/lib/server/disney-analysis";
import { fetchParkLiveData } from "@/lib/server/themeparks-api";
import type { DisneyParkKey } from "@/lib/types/disney";

export async function GET(request: Request) {
  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;

  if (park !== "tdl" && park !== "tds") {
    return Response.json({ error: "Invalid park" }, { status: 400 });
  }

  try {
    const [attractions, status] = await Promise.all([
      fetchParkLiveData(park),
      buildParkCrowdStatus(park),
    ]);

    return Response.json({
      park,
      status,
      prediction: predictDailyCrowd(park, status),
      attractions,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "待ち時間の取得に失敗しました",
      },
      { status: 502 },
    );
  }
}
