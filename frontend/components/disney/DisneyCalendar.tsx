"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crowdLevelCellStyles,
  crowdLevelDotColors,
  crowdLevelLabels,
  crowdLevelShortLabels,
  disneyPanelClass,
  formatJstDateLabel,
} from "@/lib/disney-utils";
import type { DisneyCalendarMonth, DisneyParkKey } from "@/lib/types/disney";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const LEGEND_LEVELS = ["low", "moderate", "high", "extreme"] as const;

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
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
              Crowd Forecast
            </p>
            <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
              混雑予測カレンダー
            </h2>
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
          {WEEKDAYS.map((label, i) => (
            <div key={label} className={i === 0 ? "text-rose-400/80" : i === 6 ? "text-sky-400/80" : ""}>
              {label}
            </div>
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
                  className={`flex h-9 flex-col items-center justify-center rounded-md border text-xs transition sm:h-10 ${
                    crowdLevelCellStyles[day.crowdLevel]
                  } ${day.isPast ? "opacity-45" : ""} ${
                    isSelected
                      ? "ring-2 ring-fuchsia-400 ring-offset-1 ring-offset-indigo-950"
                      : ""
                  }`}
                >
                  <span
                    className={`text-sm font-bold leading-none ${
                      day.isToday ? "text-fuchsia-100" : "text-white"
                    }`}
                  >
                    {dayNum}
                  </span>
                  <span
                    className={`mt-0.5 text-[9px] font-semibold leading-none ${
                      day.crowdLevel === "low"
                        ? "text-emerald-200"
                        : day.crowdLevel === "moderate"
                          ? "text-amber-200"
                          : day.crowdLevel === "high"
                            ? "text-orange-200"
                            : "text-rose-200"
                    }`}
                  >
                    {crowdLevelShortLabels[day.crowdLevel]}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEGEND_LEVELS.map((level) => (
            <div
              key={level}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${crowdLevelCellStyles[level]}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${crowdLevelDotColors[level]}`} />
              <span className="text-[10px] font-medium text-white">{crowdLevelLabels[level]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          祝日・曜日・季節要因から最大6か月先まで予測。セル内の文字（空/中/混/大）が混雑度です。
        </p>
      </div>
    </div>
  );
}
