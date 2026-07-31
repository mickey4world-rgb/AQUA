"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crowdLevelBgColors,
  crowdLevelColors,
  disneyPanelClass,
  formatJstDateLabel,
} from "@/lib/disney-utils";
import type { DisneyCalendarMonth, DisneyParkKey } from "@/lib/types/disney";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type DisneyCalendarProps = {
  park: DisneyParkKey;
  selectedDate: string;
  onSelectDate: (date: string) => void;
};

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function toMonthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default function DisneyCalendar({
  park,
  selectedDate,
  onSelectDate,
}: DisneyCalendarProps) {
  const initialYear = Number(selectedDate.slice(0, 4));
  const initialMonth = Number(selectedDate.slice(5, 7));
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [calendar, setCalendar] = useState<DisneyCalendarMonth | null>(null);
  const [loading, setLoading] = useState(true);

  const monthParam = useMemo(
    () => toMonthParam(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/disney/calendar?park=${park}&month=${monthParam}`);
    if (res.ok) setCalendar(await res.json());
    setLoading(false);
  }, [park, monthParam]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const year = Number(selectedDate.slice(0, 4));
    const month = Number(selectedDate.slice(5, 7));
    setViewYear(year);
    setViewMonth(month);
  }, [selectedDate]);

  const canGoPrev = calendar
    ? monthParam > toMonthParam(Number(calendar.today.slice(0, 4)), Number(calendar.today.slice(5, 7)))
    : false;

  const canGoNext = useMemo(() => {
    if (!calendar) return false;
    const todayY = Number(calendar.today.slice(0, 4));
    const todayM = Number(calendar.today.slice(5, 7));
    const currentIndex = todayY * 12 + todayM;
    const viewIndex = viewYear * 12 + viewMonth;
    return viewIndex < currentIndex + 6;
  }, [calendar, viewYear, viewMonth]);

  function goPrev() {
    if (!canGoPrev) return;
    const next = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  function goNext() {
    if (!canGoNext) return;
    const next = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  const leadingBlanks = calendar?.startWeekday ?? 0;

  return (
    <div className={`${disneyPanelClass} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
            Crowd Forecast
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">混雑予測カレンダー</h2>
        </div>
        <button
          type="button"
          onClick={() => onSelectDate(calendar?.today ?? selectedDate)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
        >
          今日
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 disabled:opacity-30"
        >
          ←
        </button>
        <p className="text-sm font-medium text-white">
          {calendar?.monthLabel ?? `${viewYear}年${viewMonth}月`}
        </p>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 disabled:opacity-30"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
        {WEEKDAYS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">カレンダーを読み込み中...</p>
      ) : calendar ? (
        <div className="mt-2 grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {calendar.days.map((day) => {
            const isSelected = day.date === selectedDate;
            const dayNum = Number(day.date.slice(8, 10));
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                title={`${formatJstDateLabel(day.date)} — ${day.crowdLabel}`}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition ${
                  isSelected
                    ? "border-fuchsia-400/60 ring-1 ring-fuchsia-400/40"
                    : "border-transparent"
                } ${crowdLevelBgColors[day.crowdLevel]} ${
                  day.isPast ? "opacity-50" : ""
                }`}
              >
                <span className={`font-semibold ${day.isToday ? "text-fuchsia-200" : "text-white"}`}>
                  {dayNum}
                </span>
                {day.isToday && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-fuchsia-300" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-400">
        {(["low", "moderate", "high", "extreme"] as const).map((level) => (
          <span
            key={level}
            className={`rounded-full border px-2 py-0.5 ${crowdLevelColors[level]}`}
          >
            {level === "low"
              ? "空き"
              : level === "moderate"
                ? "やや混雑"
                : level === "high"
                  ? "混雑"
                  : "大混雑"}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        祝日・曜日・季節要因から最大6か月先まで予測。日付を選ぶと詳細を表示します。
      </p>
    </div>
  );
}
