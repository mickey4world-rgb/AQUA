"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DisneyCompanion from "@/components/disney/DisneyCompanion";
import DisneyCrowdBreakdownPanel from "@/components/disney/DisneyCrowdBreakdownPanel";
import {
  crowdBandCellStyles,
  crowdBandLabels,
  crowdLevelCellStyles,
  crowdLevelColors,
  disneyPanelClass,
  formatJstDateLabel,
} from "@/lib/disney-utils";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import type {
  DisneyDayBriefing,
  DisneyParkKey,
  DisneyParkPublicPreview,
  DisneyShowcaseSnapshot,
} from "@/lib/types/disney";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function ForecastTable({ briefing, title }: { briefing: DisneyDayBriefing; title: string }) {
  const forecast = briefing.forecast;
  return (
    <div className={`${disneyPanelClass} overflow-hidden p-4 sm:p-5`}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[11px] text-slate-400">
        {formatJstDateLabel(briefing.date)} · 混雑スコア {briefing.crowdScore}（
        {briefing.crowdLabel}）
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[640px] w-full border-separate border-spacing-1 text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-indigo-950/95 px-2 py-1 text-left text-slate-400">
                アトラクション
              </th>
              {forecast.hourLabels.map((label) => (
                <th key={label} className="px-1 py-1 text-slate-500">
                  {label.replace(":00", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecast.attractions.map((attr) => (
              <tr key={attr.id}>
                <td className="sticky left-0 z-10 bg-indigo-950/95 px-2 py-1 text-[11px] text-slate-200">
                  {attr.nameJa}
                </td>
                {attr.slots.map((slot) => (
                  <td
                    key={slot.hour}
                    title={`${slot.label} — 約${slot.waitMinutes}分`}
                    className={`rounded px-1 py-1 text-center font-mono font-semibold ${crowdBandCellStyles[slot.band]}`}
                  >
                    {slot.waitMinutes}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["empty", "moderate", "busy", "extreme"] as const).map((band) => (
          <span
            key={band}
            className={`rounded px-2 py-0.5 text-[10px] ${crowdBandCellStyles[band]}`}
          >
            {crowdBandLabels[band]}
          </span>
        ))}
      </div>
    </div>
  );
}

function CharacterBriefing({ briefing }: { briefing: DisneyDayBriefing }) {
  const advice = briefing.characterAdvice;
  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
        {advice.targetDayLabel}の予想
      </p>
      <DisneyCompanion
        characterId={advice.characterId}
        mood="speaking"
        nameJa={advice.characterNameJa}
        line={advice.headline}
      />
      <div className={`mt-3 rounded-xl border p-3 ${crowdLevelColors[briefing.crowdLevel]}`}>
        <p className="text-sm font-medium">
          {advice.targetDayLabel} · 混雑スコア {briefing.crowdScore} / 100 ·{" "}
          {briefing.crowdLabel}
        </p>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-slate-200">
        {advice.crowdReasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        注意点
      </h4>
      <ul className="mt-2 space-y-1 text-sm text-slate-200">
        {advice.cautions.map((c) => (
          <li key={c}>• {c}</li>
        ))}
      </ul>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        回り方
      </h4>
      <ul className="mt-2 space-y-1 text-sm text-slate-200">
        {advice.touringTips.map((t) => (
          <li key={t}>• {t}</li>
        ))}
      </ul>
    </div>
  );
}

function PublicCalendar({ preview }: { preview: DisneyParkPublicPreview }) {
  const calendar = preview.calendarMonth;
  const leadingBlanks = calendar.startWeekday;

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <h3 className="text-sm font-semibold text-white">混雑予測カレンダー（{calendar.monthLabel}）</h3>
      <p className="mt-1 text-[11px] text-slate-400">
        セル内数字 = 混雑スコア（0〜100）
      </p>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
        {WEEKDAYS.map((label, i) => (
          <div
            key={label}
            className={i === 0 ? "text-rose-400/80" : i === 6 ? "text-sky-400/80" : ""}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`b-${i}`} />
        ))}
        {calendar.days.map((day) => {
          const dayNum = Number(day.date.slice(8, 10));
          return (
            <div
              key={day.date}
              title={`${formatJstDateLabel(day.date)} — ${day.crowdLabel} (${day.crowdScore})`}
              className={`flex h-9 flex-col items-center justify-center rounded-md border text-xs sm:h-10 ${crowdLevelCellStyles[day.crowdLevel]} ${day.isPast ? "opacity-40" : ""}`}
            >
              <span className={`text-sm font-bold ${day.isToday ? "text-fuchsia-100" : "text-white"}`}>
                {dayNum}
              </span>
              <span className="text-[9px] font-semibold">{day.crowdScore}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DisneyPublicPreview() {
  const [data, setData] = useState<DisneyShowcaseSnapshot | null>(null);
  const [park, setPark] = useState<DisneyParkKey>("tdl");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/tdr-preview")
      .then(async (res) => {
        if (!res.ok) throw new Error("データを取得できませんでした");
        return (await res.json()) as DisneyShowcaseSnapshot;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "エラー"));
  }, []);

  const preview = park === "tdl" ? data?.tdl : data?.tds;

  return (
    <main className={`${PAGE_MAIN_CLASS} min-h-screen bg-gradient-to-b from-indigo-950 via-slate-950 to-black`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-300/80">
            TDR Public Preview
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            混雑予測プレビュー
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            誰でも無料で閲覧できます（ルールベース予測・AI コストなし）。
            {data ? (
              <>
                {" "}
                最終更新:{" "}
                {new Date(data.generatedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}{" "}
                （JST 0:05 頃に自動更新、最大1時間キャッシュ）
              </>
            ) : null}
            リアルタイム待ち時間とチャットは
            <Link href="/login" className="text-fuchsia-300 hover:underline">
              ログイン後
            </Link>
            のダッシュボードで。
          </p>
        </div>
        <Link
          href="/login"
          className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/15 px-4 py-2 text-sm text-fuchsia-100 hover:bg-fuchsia-500/25"
        >
          ログインしてリアルタイム版 →
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["tdl", "tds"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPark(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              park === key
                ? "bg-gradient-to-r from-fuchsia-500 to-sky-500 text-white"
                : "border border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            {key === "tdl" ? "東京ディズニーランド" : "東京ディズニーシー"}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {!data && !error && (
        <p className="mt-8 text-center text-slate-400">読み込み中...</p>
      )}

      {preview && data && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`rounded-2xl border p-4 ${crowdLevelColors[preview.today.crowdLevel]}`}>
              <p className="text-xs uppercase tracking-wider opacity-80">本日</p>
              <p className="mt-1 text-2xl font-bold">{preview.today.crowdLabel}</p>
              <p className="text-sm opacity-90">スコア {preview.today.crowdScore}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${crowdLevelColors[preview.tomorrow.crowdLevel]}`}>
              <p className="text-xs uppercase tracking-wider opacity-80">明日</p>
              <p className="mt-1 text-2xl font-bold">{preview.tomorrow.crowdLabel}</p>
              <p className="text-sm opacity-90">スコア {preview.tomorrow.crowdScore}</p>
            </div>
          </div>

          <PublicCalendar preview={preview} />

          <div className="grid gap-6 lg:grid-cols-2">
            <DisneyCrowdBreakdownPanel
              breakdown={preview.today.breakdown}
              crowdLabel={preview.today.crowdLabel}
              title="本日 — 混雑スコア内訳"
            />
            <DisneyCrowdBreakdownPanel
              breakdown={preview.tomorrow.breakdown}
              crowdLabel={preview.tomorrow.crowdLabel}
              title="明日 — 混雑スコア内訳"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <CharacterBriefing briefing={preview.today} />
            <CharacterBriefing briefing={preview.tomorrow} />
          </div>

          <ForecastTable briefing={preview.today} title="本日 — 時間帯別アトラクション予想" />
          <ForecastTable briefing={preview.tomorrow} title="明日 — 時間帯別アトラクション予想" />

          <p className="text-center text-xs text-slate-500">{data.loginNotice}</p>
        </div>
      )}
    </main>
  );
}
