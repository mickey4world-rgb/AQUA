"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CrowdStatusCard from "@/components/disney/CrowdStatusCard";
import DisneyAdvicePanel from "@/components/disney/DisneyAdvicePanel";
import DisneyCalendar from "@/components/disney/DisneyCalendar";
import DisneyPageShell from "@/components/disney/DisneyPageShell";
import WaitTimeList from "@/components/disney/WaitTimeList";
import { crowdLevelColors, formatJstDateLabel } from "@/lib/disney-utils";
import {
  getAdaptiveRefreshMs,
  PAGE_MAIN_CLASS,
  useMobileProfile,
} from "@/lib/mobile-utils";
import type {
  AttractionWait,
  DisneyAdvice,
  DisneyDatePrediction,
  DisneyParkKey,
  DisneyResortStatus,
  ParkCrowdStatus,
} from "@/lib/types/disney";

type WaitResponse = {
  mode: "live" | "forecast";
  date: string;
  status: ParkCrowdStatus;
  prediction: { label: string; description: string } | DisneyDatePrediction;
  attractions: AttractionWait[];
};

const BASE_REFRESH_MS = 90_000;

function getJstTodayClient(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export default function DisneyPage() {
  const today = useMemo(() => getJstTodayClient(), []);
  const mobileProfile = useMobileProfile();
  const refreshMs = getAdaptiveRefreshMs(BASE_REFRESH_MS, mobileProfile);
  const [park, setPark] = useState<DisneyParkKey>("tdl");
  const [selectedDate, setSelectedDate] = useState(today);
  const [resortStatus, setResortStatus] = useState<DisneyResortStatus | null>(null);
  const [waitData, setWaitData] = useState<WaitResponse | null>(null);
  const [advice, setAdvice] = useState<DisneyAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [adviceLoading, setAdviceLoading] = useState(true);

  const isLiveDay = selectedDate === today;

  const loadResortStatus = useCallback(async () => {
    const res = await fetch("/api/disney/status");
    if (res.ok) setResortStatus(await res.json());
  }, []);

  const loadParkData = useCallback(
    async (selectedPark: DisneyParkKey, date: string) => {
      setLoading(true);
      const dateQuery = date !== today ? `&date=${date}` : "";
      const aiQuery = mobileProfile.saveData ? "" : "&ai=1";
      const [waitsRes, adviceRes] = await Promise.all([
        fetch(`/api/disney/waits?park=${selectedPark}${dateQuery}`),
        fetch(`/api/disney/advice?park=${selectedPark}${dateQuery}${aiQuery}`),
      ]);

      if (waitsRes.ok) setWaitData(await waitsRes.json());
      if (adviceRes.ok) setAdvice(await adviceRes.json());
      setLoading(false);
      setAdviceLoading(false);
    },
    [today, mobileProfile.saveData],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadResortStatus(),
      loadParkData(park, selectedDate),
    ]);
  }, [loadResortStatus, loadParkData, park, selectedDate]);

  useEffect(() => {
    refreshAll();
    if (!isLiveDay) return;
    const timer = setInterval(refreshAll, refreshMs);
    return () => clearInterval(timer);
  }, [refreshAll, isLiveDay, refreshMs]);

  useEffect(() => {
    setAdviceLoading(true);
    loadParkData(park, selectedDate);
  }, [park, selectedDate, loadParkData]);

  const predictionLabel =
    waitData?.prediction && "label" in waitData.prediction
      ? waitData.prediction.label
      : waitData?.prediction && "crowdLabel" in waitData.prediction
        ? waitData.prediction.crowdLabel
        : undefined;

  const predictionDescription =
    waitData?.prediction && "description" in waitData.prediction
      ? waitData.prediction.description
      : undefined;

  return (
    <DisneyPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-300/80">
              Tokyo Disney Resort
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              混雑・待ち時間ダッシュボード
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
              リアルタイム混雑とカレンダー予測（最大6か月先）で来園計画を立てられます。
              {isLiveDay
                ? ` ${Math.round(refreshMs / 1000)}秒ごとに自動更新。`
                : " 未来日は予測モードです。"}
              {mobileProfile.saveData && isLiveDay && " 節約モード: AI更新なし。"}
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            今すぐ更新
          </button>
        </div>

        {!isLiveDay && (
          <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            選択中: <span className="font-semibold">{formatJstDateLabel(selectedDate)}</span>
            {" — "}
            祝日・曜日・季節要因に基づく混雑予測を表示しています。
          </div>
        )}

        {isLiveDay && resortStatus && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className={`rounded-2xl border p-4 ${crowdLevelColors[resortStatus.overallCrowdLevel]}`}>
              <p className="text-xs uppercase tracking-wider opacity-80">Resort Overall</p>
              <p className="mt-1 text-2xl font-bold">{resortStatus.overallLabel}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${crowdLevelColors[resortStatus.tdl.crowdLevel]}`}>
              <p className="text-xs uppercase tracking-wider opacity-80">Land</p>
              <p className="mt-1 text-xl font-bold">{resortStatus.tdl.crowdLabel}</p>
              <p className="text-sm opacity-80">平均 {resortStatus.tdl.averageWait}分</p>
            </div>
            <div className={`rounded-2xl border p-4 ${crowdLevelColors[resortStatus.tds.crowdLevel]}`}>
              <p className="text-xs uppercase tracking-wider opacity-80">Sea</p>
              <p className="mt-1 text-xl font-bold">{resortStatus.tds.crowdLabel}</p>
              <p className="text-sm opacity-80">平均 {resortStatus.tds.averageWait}分</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {(["tdl", "tds"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPark(key)}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                park === key
                  ? "bg-gradient-to-r from-fuchsia-500 to-sky-500 text-white"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="sm:hidden">{key === "tdl" ? "ランド" : "シー"}</span>
              <span className="hidden sm:inline">
                {key === "tdl" ? "東京ディズニーランド" : "東京ディズニーシー"}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <DisneyCalendar
            park={park}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            {waitData && (
              <CrowdStatusCard
                status={waitData.status}
                mode={waitData.mode}
                targetDate={selectedDate}
                predictionLabel={predictionLabel}
                predictionDescription={predictionDescription}
              />
            )}
            <WaitTimeList
              attractions={waitData?.attractions ?? []}
              loading={loading}
              mode={waitData?.mode ?? "live"}
              targetDate={selectedDate}
            />
          </div>
          <div className="lg:col-span-3">
            <DisneyAdvicePanel
              advice={advice}
              loading={loading}
              aiLoading={adviceLoading}
            />
          </div>
        </div>
      </main>
    </DisneyPageShell>
  );
}
