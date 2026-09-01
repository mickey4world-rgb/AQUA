"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PublicPreviewNav from "@/components/public/PublicPreviewNav";
import { formatDistanceKm, spacePanelClass } from "@/lib/space-utils";
import type { NeoPublicPreviewSnapshot } from "@/lib/types/space";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

const AsteroidScene = dynamic(
  () => import("@/components/space/AsteroidScene"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-sm text-slate-500 sm:h-[420px]">
        3D シミュレーター読み込み中…
      </div>
    ),
  },
);

type NeoPublicPreviewProps = {
  initialData?: NeoPublicPreviewSnapshot | null;
};

export default function NeoPublicPreview({ initialData = null }: NeoPublicPreviewProps) {
  const [data, setData] = useState<NeoPublicPreviewSnapshot | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (initialData) return;

    fetch("/api/public/neo-preview")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "データの取得に失敗しました");
        }
        return (await res.json()) as NeoPublicPreviewSnapshot;
      })
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "データの取得に失敗しました");
      });
  }, [initialData]);

  const advanceProgress = useCallback((value: number) => {
    setProgress(value);
    if (value >= 1) setPlaying(false);
  }, []);

  const featured = data?.featured ?? null;

  return (
    <main
      className={`${PAGE_MAIN_CLASS} mx-auto min-h-screen max-w-6xl bg-gradient-to-b from-slate-950 via-indigo-950/40 to-black px-4 py-8 sm:px-6`}
    >
      <PublicPreviewNav showcaseAnchor="asteroid" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/80">
            NEO Public Preview
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            小惑星 3D シミュレーター
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            JPL 接近データをもとに、地球に近づく小惑星を 3D 軌道で表示します（無料プレビュー）。
            {data ? (
              <>
                {" "}
                更新:{" "}
                {new Date(data.generatedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </>
            ) : null}
          </p>
        </div>
        <Link
          href="/login"
          className="rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-100 hover:bg-indigo-500/25"
        >
          ログインしてフル版 →
        </Link>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {!data && !error ? (
        <p className="mt-8 text-center text-slate-400">読み込み中…</p>
      ) : null}

      {data && featured ? (
        <div className="mt-8 space-y-6">
          <div className={`${spacePanelClass} p-4 sm:p-5`}>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-300/80">
              {data.headline}
            </p>
            <h2 className="mt-2 text-xl font-bold text-white">
              {featured.fullName ?? featured.designation}
            </h2>
            <p className="mt-1 text-sm text-amber-100">
              最接近（日本時間）: {featured.closeApproachDateJst}
            </p>
            {data.mode === "today" && data.todayApproachCount > 1 ? (
              <p className="mt-1 text-xs text-slate-500">
                本日の接近予定は {data.todayApproachCount} 件 — うち最接近を表示中
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2">
                <p className="text-[10px] text-orange-200/80">最小接近距離</p>
                <p className="mt-1 text-lg font-bold text-orange-100">
                  {featured.distanceMinLd.toFixed(2)} LD
                </p>
                <p className="text-xs text-orange-200/80">
                  {formatDistanceKm(featured.distanceMinKm)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] text-slate-500">相対速度</p>
                <p className="mt-1 font-medium text-slate-200">
                  {featured.velocityKmS.toFixed(1)} km/s
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] text-slate-500">推定直径</p>
                <p className="mt-1 font-medium text-slate-200">
                  {featured.diameterKm ? `約 ${featured.diameterKm} km` : "—"}
                </p>
              </div>
            </div>
          </div>

          <AsteroidScene
            key={`${featured.designation}-${featured.closeApproachDate}`}
            approach={featured}
            progress={progress}
            playing={playing}
            onProgress={advanceProgress}
          />

          <div className={`${spacePanelClass} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (progress >= 1) setProgress(0);
                  setPlaying((value) => !value);
                }}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 px-5 py-2 text-sm font-semibold text-white"
              >
                {playing ? "⏸ 一時停止" : progress >= 1 ? "↺ 再生" : "▶ 接近アニメーション"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProgress(0);
                  setPlaying(false);
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:bg-white/5"
              >
                リセット
              </button>
              <span className="text-xs text-slate-500">{Math.round(progress * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(progress * 100)}
              onChange={(event) => {
                setPlaying(false);
                setProgress(Number(event.target.value) / 100);
              }}
              className="mt-4 w-full accent-indigo-500"
            />
            <p className="mt-2 text-[11px] text-slate-500">
              データ: NASA/JPL SBDB。衝突確率は教育用の簡易推定です。
            </p>
          </div>

          <p className="text-center text-xs text-slate-500">{data.loginNotice}</p>
        </div>
      ) : null}
    </main>
  );
}
