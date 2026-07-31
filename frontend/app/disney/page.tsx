"use client";

import { useCallback, useEffect, useState } from "react";
import CrowdStatusCard from "@/components/disney/CrowdStatusCard";
import DisneyAdvicePanel from "@/components/disney/DisneyAdvicePanel";
import DisneyPageShell from "@/components/disney/DisneyPageShell";
import WaitTimeList from "@/components/disney/WaitTimeList";
import { crowdLevelColors } from "@/lib/disney-utils";
import type {
  AttractionWait,
  DisneyAdvice,
  DisneyParkKey,
  DisneyResortStatus,
  ParkCrowdStatus,
} from "@/lib/types/disney";

type WaitResponse = {
  status: ParkCrowdStatus;
  prediction: { label: string; description: string };
  attractions: AttractionWait[];
};

const REFRESH_MS = 90_000;

export default function DisneyPage() {
  const [park, setPark] = useState<DisneyParkKey>("tdl");
  const [resortStatus, setResortStatus] = useState<DisneyResortStatus | null>(null);
  const [waitData, setWaitData] = useState<WaitResponse | null>(null);
  const [advice, setAdvice] = useState<DisneyAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [adviceLoading, setAdviceLoading] = useState(true);

  const loadResortStatus = useCallback(async () => {
    const res = await fetch("/api/disney/status");
    if (res.ok) setResortStatus(await res.json());
  }, []);

  const loadParkData = useCallback(async (selectedPark: DisneyParkKey) => {
    setLoading(true);
    const [waitsRes, adviceRes] = await Promise.all([
      fetch(`/api/disney/waits?park=${selectedPark}`),
      fetch(`/api/disney/advice?park=${selectedPark}&ai=1`),
    ]);

    if (waitsRes.ok) setWaitData(await waitsRes.json());
    if (adviceRes.ok) setAdvice(await adviceRes.json());
    setLoading(false);
    setAdviceLoading(false);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadResortStatus(), loadParkData(park)]);
  }, [loadResortStatus, loadParkData, park]);

  useEffect(() => {
    refreshAll();
    const timer = setInterval(refreshAll, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshAll]);

  useEffect(() => {
    setAdviceLoading(true);
    loadParkData(park);
  }, [park, loadParkData]);

  return (
    <DisneyPageShell>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-300/80">
              Tokyo Disney Resort
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              混雑・待ち時間ダッシュボード
            </h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              ランド・シーのリアルタイム混雑状況、待ち時間、回り方アドバイスを確認できます。
              {REFRESH_MS / 1000}秒ごとに自動更新。
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

        {resortStatus && (
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

        <div className="mt-6 flex gap-2">
          {(["tdl", "tds"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPark(key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                park === key
                  ? "bg-gradient-to-r from-fuchsia-500 to-sky-500 text-white"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {key === "tdl" ? "東京ディズニーランド" : "東京ディズニーシー"}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            {waitData && (
              <CrowdStatusCard
                status={waitData.status}
                predictionLabel={waitData.prediction.label}
                predictionDescription={waitData.prediction.description}
              />
            )}
            <WaitTimeList
              attractions={waitData?.attractions ?? []}
              loading={loading}
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
