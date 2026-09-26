import { withApiAccessLog } from "@/lib/server/api-access";
import {
  isUsjMonthNavigable,
  predictUsjCalendarMonth,
} from "@/lib/server/usj-calendar-prediction";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");

    const now = new Date();
    const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    let year = jstNow.getFullYear();
    let month = jstNow.getMonth() + 1;

    if (monthParam) {
      const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
      if (!match) {
        return Response.json({ error: "Invalid month format (YYYY-MM)" }, { status: 400 });
      }
      year = Number(match[1]);
      month = Number(match[2]);
    }

    if (month < 1 || month > 12 || !isUsjMonthNavigable(year, month)) {
      return Response.json({ error: "Month out of range" }, { status: 400 });
    }

    try {
      return Response.json(await predictUsjCalendarMonth(year, month));
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
