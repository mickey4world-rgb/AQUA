import {
  isUsjMonthNavigable,
  predictUsjCalendarMonth,
} from "@/lib/server/usj-calendar-prediction";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";

export const dynamic = "force-dynamic";

/** 認証不要 · USJ混雑予測カレンダー（ルールベース） */
export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-usj-calendar",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

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
    const payload = await predictUsjCalendarMonth(year, month);
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (error) {
    console.error("[usj-preview/calendar]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "カレンダー予測の取得に失敗しました",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
