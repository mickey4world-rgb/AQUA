"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CrowdStatusCard from "@/components/disney/CrowdStatusCard";
import DisneyCalendar from "@/components/disney/DisneyCalendar";
import DisneyCrowdBreakdownPanel from "@/components/disney/DisneyCrowdBreakdownPanel";
import DisneyInfoPanel from "@/components/disney/DisneyInfoPanel";
import WaitTimeList from "@/components/disney/WaitTimeList";
import UsjChatPanel from "@/components/usj/UsjChatPanel";
import UsjEveningAdvicePanel from "@/components/usj/UsjEveningAdvicePanel";
import { crowdLevelColors, formatJstDateLabel } from "@/lib/disney-utils";
import {
  getAdaptiveRefreshMs,
  PAGE_MAIN_CLASS,
  useMobileProfile,
} from "@/lib/mobile-utils";
import { USJ_PARK } from "@/lib/usj-constants";
import type {
  AttractionWait,
  DisneyAdvice,
  DisneyDatePrediction,
  ParkCrowdStatus,
} from "@/lib/types/disney";

type WaitResponse = {
  mode: "live" | "forecast";
  date: string;
  status: ParkCrowdStatus;
  prediction: { label: string; description: string } | DisneyDatePrediction;
  attractions: AttractionWait[];
};

type StatusResponse = {
  usj: ParkCrowdStatus;
  overallCrowdLevel: ParkCrowdStatus["crowdLevel"];
  overallLabel: string;
};

const BASE_REFRESH_MS = 90_000;

type RefreshResult = {
  status: StatusResponse | null;
  waits: WaitResponse | null;
  advice: DisneyAdvice | null;
  key: string;
};

function getJstTodayClient(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function getTomorrowClient(): string {
  const d = new Date(`${getJstTodayClient()}T12:00:00+09:00`);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

async function fetchUsjStatus(): Promise<StatusResponse | null> {
  const res = await fetch("/api/usj/status");
  return res.ok ? ((await res.json()) as StatusResponse) : null;
}

async function fetchUsjData(
  date: string,
  today: string,
): Promise<Pick<RefreshResult, "waits" | "advice">> {
  const dateQuery = date !== today ? `?date=${date}` : "";
  const adviceQuery = date !== today ? `?date=${date}` : "";
  const [waitsRes, adviceRes] = await Promise.all([
    fetch(`/api/usj/waits${dateQuery}`),
    fetch(`/api/usj/advice${adviceQuery}`),
  ]);

  return {
    waits: waitsRes.ok ? ((await waitsRes.json()) as WaitResponse) : null,
    advice: adviceRes.ok ? ((await adviceRes.json()) as DisneyAdvice) : null,
  };
}

export default function UsjParkDashboard() {
  const today = useMemo(() => getJstTodayClient(), []);
  const tomorrow = useMemo(() => getTomorrowClient(), []);
  const mobileProfile = useMobileProfile();
  const refreshMs = getAdaptiveRefreshMs(BASE_REFRESH_MS, mobileProfile);
  const [selectedDate, setSelectedDate] = useState(today);
  const [resortStatus, setResortStatus] = useState<StatusResponse | null>(null);
  const [waitData, setWaitData] = useState<WaitResponse | null>(null);
  const [advice, setAdvice] = useState<DisneyAdvice | null>(null);

  const dataKey = selectedDate;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== dataKey;

  const isLiveDay = selectedDate === today;
  const isPastDay = selectedDate < today;
  const isFutureDay = selectedDate > today;

  const runRefresh = useCallback(async (): Promise<RefreshResult> => {
    const [status, parkData] = await Promise.all([
      fetchUsjStatus(),
      fetchUsjData(selectedDate, today),
    ]);
    return { status, ...parkData, key: selectedDate };
  }, [selectedDate, today]);

  const applyRefresh = useCallback((result: RefreshResult) => {
    if (result.status) setResortStatus(result.status);
    if (result.waits) setWaitData(result.waits);
    if (result.advice) setAdvice(result.advice);
    setLoadedKey(result.key);
  }, []);

  const refreshAll = useCallback(async () => {
    applyRefresh(await runRefresh());
  }, [runRefresh, applyRefresh]);

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      runRefresh().then((result) => {
        if (!cancelled) applyRefresh(result);
      });
    };

    tick();

    if (!isLiveDay) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(tick, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runRefresh, applyRefresh, isLiveDay, refreshMs]);

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
    <main className={PAGE_MAIN_CLASS}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300/80">
            Universal Studios Japan
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            USJ 混雑・待ち時間ダッシュボード
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            リアルタイム混雑・数値化カレンダーで来園計画を立てられます。
            予測はディズニー運用の反省（祝日二重加点の抑制・株主／地域パス係数の非転用・関西／HHN／任天堂需要）を反映しています。
            {isLiveDay
              ? ` ${Math.round(refreshMs / 1000)}秒ごとに自動更新。`
              : isPastDay
                ? " 過去日は予想時の混雑スコアを表示します（ライブ待ち蓄積後に的中照合を強化予定）。"
                : " 未来日は予測モードです。"}
            {isFutureDay || isLiveDay
              ? " マリオ―の前日アドバイスはルールベース（AI コストなし）。"
              : ""}
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
        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          選択中:{" "}
          <span className="font-semibold">
            {formatJstDateLabel(selectedDate)}
          </span>
          {" — "}
          {isPastDay
            ? "予想時の混雑予測・Crowd Score を表示しています（リアルタイム非表示）。"
            : "祝日・曜日・季節・USJ固有イベント要因に基づく混雑予測を表示しています。"}
        </div>
      )}

      {isLiveDay && resortStatus && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div
            className={`rounded-2xl border p-4 ${crowdLevelColors[resortStatus.overallCrowdLevel]}`}
          >
            <p className="text-xs uppercase tracking-wider opacity-80">
              USJ Overall
            </p>
            <p className="mt-1 text-2xl font-bold">
              {resortStatus.overallLabel}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 ${crowdLevelColors[resortStatus.usj.crowdLevel]}`}
          >
            <p className="text-xs uppercase tracking-wider opacity-80">
              {USJ_PARK.shortJa}
            </p>
            <p className="mt-1 text-xl font-bold">
              {resortStatus.usj.crowdLabel}
            </p>
            <p className="text-sm opacity-80">
              平均 {resortStatus.usj.averageWait}分 ・ 稼働{" "}
              {resortStatus.usj.operatingCount}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <DisneyCalendar
          park="usj"
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          calendarApiPath="/api/usj/calendar"
        />
      </div>

      <div className="mt-6">
        {!isPastDay && (
          <UsjEveningAdvicePanel
            targetDate={selectedDate > today ? selectedDate : tomorrow}
          />
        )}
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
              crowdScore={
                advice?.prediction?.crowdScore ??
                advice?.breakdown?.total ??
                undefined
              }
              hideRealtime={isPastDay}
            />
          )}
          <DisneyCrowdBreakdownPanel
            breakdown={advice?.breakdown ?? null}
            crowdLabel={
              advice?.prediction?.crowdLabel ?? waitData?.status.crowdLabel
            }
            title={isPastDay ? "予想時の混雑スコア内訳" : undefined}
          />
          {!isPastDay && (
            <WaitTimeList
              attractions={waitData?.attractions ?? []}
              loading={loading}
              mode={waitData?.mode ?? "live"}
              targetDate={selectedDate}
            />
          )}
          <DisneyInfoPanel
            advice={advice}
            loading={loading}
            isPastDay={isPastDay}
          />
        </div>
        <div className="lg:col-span-3">
          <UsjChatPanel selectedDate={selectedDate} />
        </div>
      </div>
    </main>
  );
}
