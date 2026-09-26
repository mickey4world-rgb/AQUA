"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DisneyCalendar from "@/components/disney/DisneyCalendar";
import DisneyCompanion from "@/components/disney/DisneyCompanion";
import DisneyCrowdBreakdownPanel from "@/components/disney/DisneyCrowdBreakdownPanel";
import {
  crowdLevelCellStyles,
  crowdLevelColors,
  disneyPanelClass,
  formatJstDateLabel,
} from "@/lib/disney-utils";
import type {
  CrowdLevel,
  DisneyCharacterEveningAdvice,
  DisneyCrowdBreakdown,
} from "@/lib/types/disney";

type UsjPreviewSnapshot = {
  park: "usj";
  parkName: string;
  fetchedAt: string;
  today: {
    date: string;
    crowdLevel: CrowdLevel;
    crowdLabel: string;
    crowdScore: number;
  };
  tomorrow: {
    date: string;
    crowdLevel: CrowdLevel;
    crowdLabel: string;
    crowdScore: number;
  };
};

type UsjDayBriefing = {
  date: string;
  crowdLevel: CrowdLevel;
  crowdLabel: string;
  crowdScore: number;
  estimatedWait: number;
  factors: string[];
  description: string;
  characterAdvice: DisneyCharacterEveningAdvice;
  breakdown: DisneyCrowdBreakdown;
};

type UsjPublicPreviewProps = {
  /** 親シェルがナビを出すとき false */
  showNav?: boolean;
};

export default function UsjPublicPreview({ showNav = true }: UsjPublicPreviewProps) {
  const [data, setData] = useState<UsjPreviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dayBriefing, setDayBriefing] = useState<UsjDayBriefing | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/public/usj-preview")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "USJプレビューの取得に失敗しました");
        }
        return (await res.json()) as UsjPreviewSnapshot;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setSelectedDate(payload.today.date);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "エラー");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    setDayLoading(true);
    fetch(`/api/public/usj-preview/day?date=${selectedDate}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as UsjDayBriefing) : null,
      )
      .catch(() => null)
      .then((payload) => {
        if (cancelled) return;
        setDayBriefing(payload);
      })
      .finally(() => {
        if (!cancelled) setDayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const advice = dayBriefing?.characterAdvice;
  const today = data?.today.date;
  const tomorrow = data?.tomorrow.date;

  const subtitle = useMemo(() => {
    if (!data?.fetchedAt) return null;
    return new Date(data.fetchedAt).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });
  }, [data?.fetchedAt]);

  return (
    <div className={showNav ? undefined : "contents"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300/80">
            USJ Public Preview
          </p>
          <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
            ユニバーサル・スタジオ・ジャパン 混雑予測
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            誰でも無料で閲覧できます（ルールベース予測・AI コストなし）。
            マリオ―のアドバイス付き。カレンダーは当月から最大6か月先まで。
            {subtitle ? <> 最終更新: {subtitle}（JST）</> : null}
            リアルタイム待ち時間とチャットは
            <Link href="/login" className="text-red-300 hover:underline">
              ログイン後
            </Link>
            。
          </p>
        </div>
        <Link
          href="/login"
          className="rounded-full border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm text-red-100 hover:bg-red-500/25"
        >
          ログインしてリアルタイム版 →
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {!data && !error && loading && (
        <p className="mt-8 text-center text-slate-400">読み込み中...</p>
      )}

      {data && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedDate(data.today.date)}
              className={`rounded-2xl border p-4 text-left transition ${crowdLevelColors[data.today.crowdLevel]} ${
                selectedDate === data.today.date ? "ring-2 ring-red-400" : ""
              }`}
            >
              <p className="text-xs uppercase tracking-wider opacity-80">本日</p>
              <p className="mt-1 text-2xl font-bold">{data.today.crowdLabel}</p>
              <p className="text-sm opacity-90">スコア {data.today.crowdScore}</p>
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(data.tomorrow.date)}
              className={`rounded-2xl border p-4 text-left transition ${crowdLevelColors[data.tomorrow.crowdLevel]} ${
                selectedDate === data.tomorrow.date ? "ring-2 ring-red-400" : ""
              }`}
            >
              <p className="text-xs uppercase tracking-wider opacity-80">明日</p>
              <p className="mt-1 text-2xl font-bold">{data.tomorrow.crowdLabel}</p>
              <p className="text-sm opacity-90">スコア {data.tomorrow.crowdScore}</p>
            </button>
          </div>

          <DisneyCalendar
            park="usj"
            selectedDate={selectedDate || data.today.date}
            onSelectDate={setSelectedDate}
            calendarApiPath="/api/public/usj-preview/calendar"
          />

          {selectedDate && (
            <div
              className={`rounded-2xl border px-4 py-3 ${crowdLevelCellStyles[dayBriefing?.crowdLevel ?? data.today.crowdLevel]}`}
            >
              <p className="text-sm font-medium text-white">
                選択中: {formatJstDateLabel(selectedDate)}
                {dayBriefing ? (
                  <>
                    {" "}
                    · 混雑スコア {dayBriefing.crowdScore}（{dayBriefing.crowdLabel}）
                  </>
                ) : dayLoading ? (
                  " · 読み込み中…"
                ) : null}
              </p>
              {selectedDate === today ? (
                <p className="mt-1 text-[11px] opacity-80">本日の予測</p>
              ) : selectedDate === tomorrow ? (
                <p className="mt-1 text-[11px] opacity-80">明日の予測</p>
              ) : null}
            </div>
          )}

          {advice && (
            <div className={`${disneyPanelClass} p-4 sm:p-5`}>
              <p className="text-xs uppercase tracking-[0.2em] text-red-300/80">
                Mario Briefing
              </p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {advice.characterNameJa}のアドバイス
              </h3>
              <div className="mt-4">
                <DisneyCompanion
                  characterId="baymax"
                  mood="speaking"
                  nameJa={advice.characterNameJa}
                  line={advice.headline}
                />
              </div>
              {(advice.monologue?.length ?? 0) > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-slate-200">
                  {advice.monologue.map((line) => (
                    <li key={line}>・{line}</li>
                  ))}
                </ul>
              )}
              {(advice.touringTips?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    回り方ヒント
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
                    {advice.touringTips.map((tip) => (
                      <li key={tip}>・{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DisneyCrowdBreakdownPanel
            variant="usj"
            breakdown={dayBriefing?.breakdown ?? null}
            crowdLabel={dayBriefing?.crowdLabel}
          />
        </div>
      )}
    </div>
  );
}
