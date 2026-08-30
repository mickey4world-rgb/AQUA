import { getJstToday } from "@/lib/disney-holidays";
import { buildCharacterEveningAdvice } from "@/lib/server/disney-character-advice";
import { buildDayForecast, getTomorrowJst } from "@/lib/server/disney-hourly-forecast";
import { predictCalendarMonth } from "@/lib/server/disney-calendar-prediction";
import type { DisneyShowcaseSnapshot } from "@/lib/types/disney";

export const revalidate = 3600;

async function buildParkShowcase(park: "tdl" | "tds", today: string, tomorrow: string) {
  const now = new Date(`${today}T12:00:00+09:00`);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const calendarMonth = await predictCalendarMonth(park, year, month);
  const calendar = calendarMonth.days.filter((d) => !d.isPast).slice(0, 14);
  const eveningAdvice = buildCharacterEveningAdvice(park, tomorrow, "evening");
  const todayForecast = await buildDayForecast(park, today);

  return { calendar, eveningAdvice, todayForecast };
}

export async function GET() {
  try {
    const today = getJstToday();
    const tomorrow = getTomorrowJst();
    const [tdl, tds] = await Promise.all([
      buildParkShowcase("tdl", today, tomorrow),
      buildParkShowcase("tds", today, tomorrow),
    ]);

    const payload: DisneyShowcaseSnapshot = {
      generatedAt: new Date().toISOString(),
      today,
      tomorrow,
      tdl,
      tds,
    };

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
