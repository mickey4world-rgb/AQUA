import { withApiAccessLog } from "@/lib/server/api-access";
import { buildDisneyAdvice } from "@/lib/server/disney-analysis";
import type { DisneyParkKey } from "@/lib/types/disney";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
    const date = searchParams.get("date");

    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }

    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    try {
      const advice = await buildDisneyAdvice(park, date ?? undefined);
      return Response.json(advice);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "アドバイスの取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
