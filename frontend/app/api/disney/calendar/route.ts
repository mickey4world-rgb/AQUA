import { withApiAccessLog } from "@/lib/server/api-access";
import {
  isMonthNavigable,
  predictCalendarMonth,
} from "@/lib/server/disney-calendar-prediction";
import type { DisneyParkKey } from "@/lib/types/disney";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
    const monthParam = searchParams.get("month");

    if (park !== "tdl" && park !== "tds") {
      return Response.json({ error: "Invalid park" }, { status: 400 });
    }

    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const defaultYear = jstNow.getFullYear();
    const defaultMonth = jstNow.getMonth() + 1;

    let year = defaultYear;
    let month = defaultMonth;

    if (monthParam) {
      const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
      if (!match) {
        return Response.json({ error: "Invalid month format (YYYY-MM)" }, { status: 400 });
      }
      year = Number(match[1]);
      month = Number(match[2]);
    }

    if (month < 1 || month > 12 || !isMonthNavigable(year, month)) {
      return Response.json({ error: "Month out of range" }, { status: 400 });
    }

    try {
      return Response.json(await predictCalendarMonth(park, year, month));
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "カレンダー予測の取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
