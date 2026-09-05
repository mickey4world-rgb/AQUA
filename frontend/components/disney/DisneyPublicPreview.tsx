"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DisneyCalendar from "@/components/disney/DisneyCalendar";
import DisneyCompanion from "@/components/disney/DisneyCompanion";
import DisneyCrowdBreakdownPanel from "@/components/disney/DisneyCrowdBreakdownPanel";
import PublicPreviewNav from "@/components/public/PublicPreviewNav";
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
  DisneyShowcaseSnapshot,
} from "@/lib/types/disney";

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
  const accuracy = briefing.accuracy;
  const crowdReasons =
    advice.crowdReasons.length > 0
      ? advice.crowdReasons
      : Object.values(briefing.breakdown.labels)
          .filter(
            (label) =>
              !label.includes("通常") &&
              !label.includes("平常") &&
              !label.includes("平均") &&
              label !== "災害影響小",
          )
          .slice(0, 6);

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
        {briefing.isPast ? "Past Day Review" : `${advice.targetDayLabel}の予想`}
      </p>
      <DisneyCompanion
        characterId={advice.characterId}
        mood="speaking"
        nameJa={advice.characterNameJa}
        line={advice.headline}
      />

      {(advice.monologue?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {advice.characterNameJa}の感想
          </p>
          {advice.monologue.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-slate-200">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className={`mt-3 rounded-xl border p-3 ${crowdLevelColors[briefing.crowdLevel]}`}>
        <p className="text-sm font-medium">
          {advice.targetDayLabel} · 混雑スコア {briefing.crowdScore} / 100 ·{" "}
          {briefing.crowdLabel}
        </p>
      </div>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        混雑の主な要因
      </h4>
      <ul className="mt-2 space-y-1 text-sm text-slate-200">
        {crowdReasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>

      {briefing.isPast && (
        <section
          className={`mt-4 rounded-xl border p-3 ${
            accuracy && !accuracy.pending
              ? accuracy.levelHit
                ? "border-emerald-400/30 bg-emerald-500/10"
                : "border-rose-400/30 bg-rose-500/10"
              : "border-white/10 bg-white/[0.03]"
          }`}
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            的中結果・評価
          </h4>
          {accuracy && !accuracy.pending ? (
            <>
              <p className="mt-1 text-sm font-semibold text-white">
                {accuracy.levelHit ? "的中" : "外れ"}
                <span className="ml-2 font-normal text-slate-300">
                  予想 {accuracy.predictedScore}点 → 実績推定 {accuracy.actualScore}点
                  （差 {accuracy.scoreDelta > 0 ? "+" : ""}
                  {accuracy.scoreDelta}）
                </span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                {accuracy.explanation}
              </p>
              {advice.accuracyReflection ? (
                <p className="mt-2 text-sm leading-relaxed text-fuchsia-100/90">
                  {advice.characterNameJa} — {advice.accuracyReflection}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-300">
              {accuracy?.explanation ?? "実績データ待ちのため、的中率は未評価です。"}
            </p>
          )}
        </section>
      )}

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

export default function DisneyPublicPreview() {
  const [data, setData] = useState<DisneyShowcaseSnapshot | null>(null);
  const [park, setPark] = useState<DisneyParkKey>("tdl");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dayBriefing, setDayBriefing] = useState<DisneyDayBriefing | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/tdr-preview")
      .then(async (res) => {
        if (!res.ok) throw new Error("データを取得できませんでした");
        return (await res.json()) as DisneyShowcaseSnapshot;
      })
      .then((payload) => {
        setData(payload);
        setSelectedDate(payload.today);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "エラー"));
  }, []);

  const preview = park === "tdl" ? data?.tdl : data?.tds;

  const cachedBriefing = useMemo(() => {
    if (!preview || !selectedDate) return null;
    if (selectedDate === preview.today.date) return preview.today;
    if (selectedDate === preview.tomorrow.date) return preview.tomorrow;
    return null;
  }, [preview, selectedDate]);

  useEffect(() => {
    if (!selectedDate || !data) return;

    if (cachedBriefing) {
      setDayBriefing(cachedBriefing);
      setDayLoading(false);
      setDayError(null);
      return;
    }

    let cancelled = false;
    setDayLoading(true);
    setDayError(null);

    fetch(`/api/public/tdr-preview/day?park=${park}&date=${selectedDate}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("日別予測を取得できませんでした");
        return (await res.json()) as DisneyDayBriefing;
      })
      .then((payload) => {
        if (!cancelled) {
          setDayBriefing(payload);
          setDayError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDayBriefing(null);
          setDayError(e instanceof Error ? e.message : "エラー");
        }
      })
      .finally(() => {
        if (!cancelled) setDayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate, park, data, cachedBriefing]);

  useEffect(() => {
    if (!data) return;
    setSelectedDate(data.today);
  }, [park, data]);

  return (
    <main
      className={`${PAGE_MAIN_CLASS} mx-auto min-h-screen max-w-6xl bg-gradient-to-b from-indigo-950 via-slate-950 to-black px-4 py-8 sm:px-6`}
    >
      <PublicPreviewNav showcaseAnchor="disney" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-300/80">
            TDR Public Preview
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">混雑予測プレビュー</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            誰でも無料で閲覧できます（ルールベース予測・AI コストなし）。
            カレンダーは当月から最大6か月先まで選べます。
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
            <button
              type="button"
              onClick={() => setSelectedDate(preview.today.date)}
              className={`rounded-2xl border p-4 text-left transition ${crowdLevelColors[preview.today.crowdLevel]} ${
                selectedDate === preview.today.date ? "ring-2 ring-fuchsia-400" : ""
              }`}
            >
              <p className="text-xs uppercase tracking-wider opacity-80">本日</p>
              <p className="mt-1 text-2xl font-bold">{preview.today.crowdLabel}</p>
              <p className="text-sm opacity-90">スコア {preview.today.crowdScore}</p>
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(preview.tomorrow.date)}
              className={`rounded-2xl border p-4 text-left transition ${crowdLevelColors[preview.tomorrow.crowdLevel]} ${
                selectedDate === preview.tomorrow.date ? "ring-2 ring-fuchsia-400" : ""
              }`}
            >
              <p className="text-xs uppercase tracking-wider opacity-80">明日</p>
              <p className="mt-1 text-2xl font-bold">{preview.tomorrow.crowdLabel}</p>
              <p className="text-sm opacity-90">スコア {preview.tomorrow.crowdScore}</p>
            </button>
          </div>

          <DisneyCalendar
            park={park}
            selectedDate={selectedDate || data.today}
            onSelectDate={setSelectedDate}
            calendarApiPath="/api/public/tdr-preview/calendar"
          />

          {selectedDate && (
            <div
              className={`rounded-2xl border px-4 py-3 ${crowdLevelCellStyles[dayBriefing?.crowdLevel ?? preview.today.crowdLevel]}`}
            >
              <p className="text-sm font-medium text-white">
                選択中: {formatJstDateLabel(selectedDate)}
                {dayBriefing ? (
                  <>
                    {" "}
                    · 混雑スコア {dayBriefing.crowdScore}（{dayBriefing.crowdLabel}）
                  </>
                ) : null}
                {dayBriefing?.isPast && dayBriefing.accuracy && !dayBriefing.accuracy.pending ? (
                  <>
                    {" "}
                    · 的中評価:{" "}
                    <span className={dayBriefing.accuracy.levelHit ? "text-emerald-200" : "text-rose-200"}>
                      {dayBriefing.accuracy.levelHit ? "的中" : "外れ"}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          )}

          {dayLoading && (
            <p className="text-center text-sm text-slate-400">日別予測を読み込み中…</p>
          )}

          {dayError && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {dayError}
            </p>
          )}

          {dayBriefing && !dayLoading && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <DisneyCrowdBreakdownPanel
                  breakdown={dayBriefing.breakdown}
                  crowdLabel={dayBriefing.crowdLabel}
                  title={`${dayBriefing.characterAdvice.targetDayLabel} — 混雑スコア内訳`}
                />
                <CharacterBriefing briefing={dayBriefing} />
              </div>

              <ForecastTable
                briefing={dayBriefing}
                title={`${dayBriefing.characterAdvice.targetDayLabel} — 時間帯別アトラクション予想`}
              />
            </>
          )}

          <p className="text-center text-xs text-slate-500">{data.loginNotice}</p>
        </div>
      )}
    </main>
  );
}
