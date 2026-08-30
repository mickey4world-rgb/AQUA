import { getJstToday } from "@/lib/disney-holidays";
import { withApiAccessLog } from "@/lib/server/api-access";
import { buildCharacterEveningAdvice } from "@/lib/server/disney-character-advice";
import { getTomorrowJst } from "@/lib/server/disney-hourly-forecast";
import type { DisneyParkKey } from "@/lib/types/disney";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
    const date = searchParams.get("date") ?? getTomorrowJst();

    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }
    if (!DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }

    const today = getJstToday();
    const mode = date > today ? "evening" : "preview";

    try {
      const advice = buildCharacterEveningAdvice(park, date, mode);
      return Response.json(advice);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "キャラクターアドバイスの取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
