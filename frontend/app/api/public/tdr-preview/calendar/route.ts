import {
  isMonthNavigable,
} from "@/lib/server/disney-calendar-prediction";
import { getPublicCalendarMonth } from "@/lib/server/disney-showcase-cache";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";
import type { DisneyParkKey } from "@/lib/types/disney";

export const dynamic = "force-dynamic";

/** 認証不要 · 混雑予測カレンダー（事前キャッシュのみ） */
export async function GET(request: Request) {
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "public-tdr-calendar",
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const park = (searchParams.get("park") ?? "tdl") as DisneyParkKey;
  const monthParam = searchParams.get("month");

  if (park !== "tdl" && park !== "tds") {
    return Response.json({ error: "Invalid park" }, { status: 400 });
  }

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

  if (month < 1 || month > 12 || !isMonthNavigable(year, month)) {
    return Response.json({ error: "Month out of range" }, { status: 400 });
  }

  try {
    const payload = await getPublicCalendarMonth(park, year, month);
    if (!payload) {
      return Response.json(
        {
          error:
            "この月の公開カレンダーはまだ準備されていません。少し待ってから再読み込みしてください。",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "60",
            "X-TDR-Preview": "missing-calendar",
          },
        },
      );
    }

    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "X-TDR-Preview": "calendar-snapshot",
      },
    });
  } catch (error) {
    console.error("[tdr-preview/calendar]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "カレンダー予測の取得に失敗しました",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
