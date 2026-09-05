/** 日本の祝日（2025–2027）。JST の YYYY-MM-DD。 */
const JAPAN_HOLIDAYS = new Set([
  // 2025
  "2025-01-01",
  "2025-01-13",
  "2025-02-11",
  "2025-02-23",
  "2025-02-24",
  "2025-03-20",
  "2025-04-29",
  "2025-05-03",
  "2025-05-04",
  "2025-05-05",
  "2025-05-06",
  "2025-07-21",
  "2025-08-11",
  "2025-09-15",
  "2025-09-23",
  "2025-10-13",
  "2025-11-03",
  "2025-11-23",
  "2025-11-24",
  // 2026
  "2026-01-01",
  "2026-01-12",
  "2026-02-11",
  "2026-02-23",
  "2026-03-20",
  "2026-04-29",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-07-20",
  "2026-08-11",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-10-12",
  "2026-11-03",
  "2026-11-23",
  // 2027
  "2027-01-01",
  "2027-01-11",
  "2027-02-11",
  "2027-02-23",
  "2027-03-21",
  "2027-04-29",
  "2027-05-03",
  "2027-05-04",
  "2027-05-05",
  "2027-07-19",
  "2027-08-11",
  "2027-09-20",
  "2027-09-23",
  "2027-10-11",
  "2027-11-03",
  "2027-11-23",
]);

export function isJapanHoliday(dateStr: string): boolean {
  return JAPAN_HOLIDAYS.has(dateStr);
}

export function isHolidayEve(dateStr: string): boolean {
  const next = addDays(dateStr, 1);
  return isJapanHoliday(next);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return formatJstDate(date);
}

export function shiftJstDate(dateStr: string, days: number): string {
  return addDays(dateStr, days);
}

export function formatJstDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export function getJstToday(): string {
  return formatJstDate(new Date());
}

export function parseJstDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
} {
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    dayOfWeek: date.getDay(),
  };
}

export function compareDateStr(a: string, b: string): number {
  return a.localeCompare(b);
}

export function getMonthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const mm = String(month).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
}

export function getMonthStartWeekday(year: number, month: number): number {
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00+09:00`).getDay();
}
