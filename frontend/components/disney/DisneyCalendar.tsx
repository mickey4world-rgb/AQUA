"use client";

import { useEffect, useMemo, useState } from "react";
import {
  crowdLevelCellStyles,
  crowdLevelDotColors,
  crowdLevelLabels,
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
  /** 公開プレビューでは /api/public/tdr-preview/calendar */
  calendarApiPath?: string;
};

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function toMonthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseYearMonth(date: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return { year: jst.getFullYear(), month: jst.getMonth() + 1 };
}

function matchesRequest(
  data: DisneyCalendarMonth,
  park: DisneyParkKey,
  year: number,
  month: number,
): boolean {
  return data.park === park && data.year === year && data.month === month;
}

export default function DisneyCalendar({
  park,
  selectedDate,
  onSelectDate,
  calendarApiPath = "/api/disney/calendar",
}: DisneyCalendarProps) {
  const initial = parseYearMonth(selectedDate);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const [calendar, setCalendar] = useState<DisneyCalendarMonth | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const monthParam = useMemo(
    () => toMonthParam(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const requestKey = `${park}:${monthParam}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== requestKey;

  const [syncedDate, setSyncedDate] = useState(selectedDate);
  if (syncedDate !== selectedDate && selectedDate) {
    setSyncedDate(selectedDate);
    const next = parseYearMonth(selectedDate);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  useEffect(() => {
    let cancelled = false;
    setLoadedKey(null);
    setLoadError(null);

    fetch(`${calendarApiPath}?park=${park}&month=${monthParam}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "カレンダーの取得に失敗しました");
        }
        return (await res.json()) as DisneyCalendarMonth;
      })
      .then((data) => {
        if (cancelled) return;
        if (matchesRequest(data, park, viewYear, viewMonth)) {
          setCalendar(data);
          setLoadError(null);
        } else {
          setLoadError("カレンダーデータが一致しませんでした");
        }
        setLoadedKey(requestKey);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "カレンダーの取得に失敗しました",
        );
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [park, monthParam, calendarApiPath, requestKey, viewYear, viewMonth]);

  const canGoPrev = useMemo(() => {
    const todayY = calendar ? Number(calendar.today.slice(0, 4)) : initial.year;
    const todayM = calendar ? Number(calendar.today.slice(5, 7)) : initial.month;
    const currentIndex = todayY * 12 + todayM;
    const viewIndex = viewYear * 12 + viewMonth;
    return viewIndex > currentIndex - 2;
  }, [calendar, viewYear, viewMonth, initial.year, initial.month]);

  const canGoNext = useMemo(() => {
    const todayY = calendar ? Number(calendar.today.slice(0, 4)) : initial.year;
    const todayM = calendar ? Number(calendar.today.slice(5, 7)) : initial.month;
    const currentIndex = todayY * 12 + todayM;
    const viewIndex = viewYear * 12 + viewMonth;
    return viewIndex < currentIndex + 6;
  }, [calendar, viewYear, viewMonth, initial.year, initial.month]);

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

  const displayCalendar =
    calendar && matchesRequest(calendar, park, viewYear, viewMonth) ? calendar : null;
  const leadingBlanks = displayCalendar?.startWeekday ?? 0;

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
            onClick={() => onSelectDate(displayCalendar?.today ?? selectedDate)}
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
            {displayCalendar?.monthLabel ?? `${viewYear}年${viewMonth}月`}
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
            <div
              key={label}
              className={
                i === 0 ? "text-rose-400/80" : i === 6 ? "text-sky-400/80" : ""
              }
            >
              {label}
            </div>
          ))}
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">
            カレンダーを読み込み中...
          </p>
        ) : loadError ? (
          <p className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {loadError}
          </p>
        ) : displayCalendar ? (
          <div className="mt-2 grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {displayCalendar.days.map((day) => {
              const isSelected = day.date === selectedDate;
              const dayNum = Number(day.date.slice(8, 10));
              const hitMark =
                day.isPast && day.accuracy
                  ? day.accuracy.levelHit
                    ? "的"
                    : "外"
                  : null;
              const titleParts = [
                formatJstDateLabel(day.date),
                `予測 ${day.crowdLabel}（${day.crowdScore}）`,
              ];
              if (day.accuracy) {
                titleParts.push(
                  `実績 ${day.accuracy.actualScore}点（差 ${day.accuracy.scoreDelta > 0 ? "+" : ""}${day.accuracy.scoreDelta}）`,
                  day.accuracy.levelHit ? "的中" : "外れ",
                );
              }
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectDate(day.date)}
                  title={titleParts.filter(Boolean).join(" — ")}
                  className={`relative flex h-10 flex-col items-center justify-center rounded-md border text-xs transition sm:h-11 ${
                    crowdLevelCellStyles[day.crowdLevel]
                  } ${day.isPast && !day.accuracy ? "opacity-50" : ""} ${
                    isSelected
                      ? "ring-2 ring-fuchsia-400 ring-offset-1 ring-offset-indigo-950"
                      : ""
                  }`}
                >
                  {hitMark && (
                    <span
                      className={`absolute right-0.5 top-0.5 text-[8px] font-bold leading-none ${
                        day.accuracy?.levelHit
                          ? "text-emerald-200"
                          : "text-rose-200"
                      }`}
                    >
                      {hitMark}
                    </span>
                  )}
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
                    {day.crowdScore}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-400">カレンダーを表示できませんでした。</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEGEND_LEVELS.map((level) => (
            <div
              key={level}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${crowdLevelCellStyles[level]}`}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${crowdLevelDotColors[level]}`}
              />
              <span className="text-[10px] font-medium text-white">
                {crowdLevelLabels[level]}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          セル内数字は予想時の混雑スコア（0〜100）。過去日は右上に「的／外」で的中結果を追加表示します。
        </p>
        {displayCalendar?.accuracySummary &&
          displayCalendar.accuracySummary.evaluatedDays > 0 && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-xs font-medium text-sky-200">
                今月の的中率{" "}
                <span className="text-white">
                  {displayCalendar.accuracySummary.hitRate}%
                </span>
                <span className="ml-1 font-normal text-slate-400">
                  （{displayCalendar.accuracySummary.hits}/
                  {displayCalendar.accuracySummary.evaluatedDays}日 · 平均誤差{" "}
                  {displayCalendar.accuracySummary.meanAbsScoreError}点）
                </span>
              </p>
            </div>
          )}
        {displayCalendar?.accuracySummary?.latestReviewSummary && (
          <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300/80">
              月次見直しサマリー
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-200">
              {displayCalendar.accuracySummary.latestReviewSummary}
            </p>
            {displayCalendar.accuracySummary.reviewNewsFindings &&
              displayCalendar.accuracySummary.reviewNewsFindings.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                  {displayCalendar.accuracySummary.reviewNewsFindings.map((line) => (
                    <li key={line}>・{line}</li>
                  ))}
                </ul>
              )}
            {displayCalendar.accuracySummary.rulesChanged &&
              displayCalendar.accuracySummary.rulesChanged.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-100/90">
                  {displayCalendar.accuracySummary.rulesChanged.join(" / ")}
                </p>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
