"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceKm, spacePanelClass } from "@/lib/space-utils";
import type { CloseApproach } from "@/lib/types/space";

const AsteroidScene = dynamic(
  () => import("@/components/space/AsteroidScene"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-white/10 bg-black/40 text-sm text-slate-500 sm:h-[480px]">
        3D シミュレーター読み込み中...
      </div>
    ),
  },
);

export default function AsteroidSimulatorTab() {
  const [approaches, setApproaches] = useState<CloseApproach[]>([]);
  const [selected, setSelected] = useState<CloseApproach | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    fetch("/api/space/neo?limit=30")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const list = data.approaches as CloseApproach[];
        setApproaches(list);
        if (list[0]) void selectApproach(list[0], list);
      })
      .catch(() => setError("小惑星データの読み込みに失敗しました"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadImageFor(item: CloseApproach) {
    if (item.imageUrl) return item;
    setImageLoading(true);
    try {
      const res = await fetch(
        `/api/space/neo/image?des=${encodeURIComponent(item.designation)}&name=${encodeURIComponent(item.fullName ?? "")}`,
      );
      const data = await res.json();
      if (data.url) {
        return {
          ...item,
          imageUrl: data.url as string,
          imageCredit: (data.credit as string) || "NASA Images",
        };
      }
    } catch {
      // 写真なしでも詳細は表示
    } finally {
      setImageLoading(false);
    }
    return item;
  }

  async function selectApproach(
    item: CloseApproach,
    list: CloseApproach[] = approaches,
  ) {
    setProgress(0);
    setPlaying(false);
    setSelected(item);

    const withImage = await loadImageFor(item);
    setSelected(withImage);
    setApproaches((prev) =>
      (prev.length ? prev : list).map((row) =>
        row.designation === withImage.designation &&
        row.closeApproachDate === withImage.closeApproachDate
          ? withImage
          : row,
      ),
    );
  }

  function togglePlay() {
    if (progress >= 1) setProgress(0);
    setPlaying((p) => !p);
  }

  const advanceProgress = useCallback((value: number) => {
    setProgress(value);
    if (value >= 1) setPlaying(false);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <div className={spacePanelClass}>
          <h2 className="text-sm font-semibold text-white">地球接近小惑星</h2>
          <p className="mt-1 text-xs text-slate-400">
            NASA/JPL SBDB — 今後2年・0.2 AU 以内（接近日が近い順）
          </p>

          {loading && (
            <p className="mt-4 text-sm text-slate-500">読み込み中...</p>
          )}
          {error && (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <ul className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {approaches.map((item) => (
              <li key={`${item.designation}-${item.closeApproachDate}`}>
                <button
                  type="button"
                  onClick={() => void selectApproach(item)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selected?.designation === item.designation &&
                    selected?.closeApproachDate === item.closeApproachDate
                      ? "border-orange-400/40 bg-orange-500/10"
                      : "border-white/5 bg-black/20 hover:bg-white/5"
                  }`}
                >
                  <p className="text-sm font-medium text-white">
                    {item.designation}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {item.closeApproachDateJst}
                  </p>
                  <p className="mt-1 text-xs text-orange-200">
                    最接近: {item.distanceMinLd.toFixed(1)} LD (
                    {formatDistanceKm(item.distanceMinKm)})
                  </p>
                  <p className="mt-1 text-[10px] text-rose-200/80">
                    衝突確率（この接近）: {item.impactProbabilityLabel}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-3">
        {selected && (
          <>
            <div className={spacePanelClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-white">
                    {selected.fullName ?? selected.designation}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-amber-100">
                    最接近（日本時間）: {selected.closeApproachDateJst}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    JPL 記録: {selected.closeApproachDate}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  {(selected.imageUrl || imageLoading) && (
                    <div className="h-24 w-24 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      {selected.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selected.imageUrl}
                          alt={selected.designation}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
                          …
                        </div>
                      )}
                    </div>
                  )}
                  <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-orange-200/80">
                      最小接近距離
                    </p>
                    <p className="text-lg font-bold text-orange-100">
                      {selected.distanceMinLd.toFixed(2)} LD
                    </p>
                    <p className="text-xs text-orange-200/80">
                      {formatDistanceKm(selected.distanceMinKm)} ·{" "}
                      {selected.distanceMinAu.toFixed(4)} AU
                    </p>
                  </div>
                </div>
              </div>
              {selected.imageCredit && (
                <p className="mt-2 text-[10px] text-slate-500">{selected.imageCredit}</p>
              )}

              <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 sm:col-span-2">
                  <p className="text-[10px] text-rose-200/80">衝突確率（この接近・簡易推定）</p>
                  <p className="mt-1 text-lg font-bold text-rose-100">
                    {selected.impactProbabilityLabel}
                  </p>
                  {selected.sentryImpactProbabilityLabel && (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Sentry 累積 IP: {selected.sentryImpactProbabilityLabel}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-slate-500">相対速度</p>
                  <p className="font-medium text-slate-200">
                    {selected.velocityKmS.toFixed(1)} km/s
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-slate-500">推定直径</p>
                  <p className="font-medium text-slate-200">
                    {selected.diameterKm ? `約 ${selected.diameterKm} km` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 sm:col-span-2 lg:col-span-4">
                  <p className="text-[10px] text-amber-100/80">大きさの目安</p>
                  <p className="mt-1 text-sm text-amber-50">
                    {selected.diameterKm
                      ? selected.diameterKm >= 1
                        ? `直径約 ${selected.diameterKm.toFixed(2)} km（東京ドーム約 ${(selected.diameterKm / 0.2).toFixed(0)} 個分のイメージ）`
                        : selected.diameterKm >= 0.1
                          ? `直径約 ${(selected.diameterKm * 1000).toFixed(0)} m（高層ビル規模）`
                          : `直径約 ${(selected.diameterKm * 1000).toFixed(0)} m（バス〜建物規模）`
                      : "直径は絶対等級からの推定です。"}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-200"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            4,
                            Math.log10((selected.diameterKm ?? 0.01) * 1000 + 1) * 28,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    バーは相対スケール（ログ）。3D 上の小惑星も直径に比例して大きさを変えています。
                  </p>
                </div>
              </div>

              {selected.nearbyRegions && selected.nearbyRegions.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2">
                  <p className="text-[10px] text-amber-100/80">
                    衝突しうる場合の参考地域（教育用の仮置き）
                  </p>
                  <p className="mt-1 text-sm text-amber-50">
                    {selected.nearbyRegions.join(" / ")}
                  </p>
                </div>
              )}
            </div>

            <AsteroidScene
              key={`${selected.designation}-${selected.closeApproachDate}`}
              approach={selected}
              progress={progress}
              playing={playing}
              onProgress={advanceProgress}
            />

            <div className={spacePanelClass}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-2 text-sm font-semibold text-white"
                >
                  {playing
                    ? "⏸ 一時停止"
                    : progress >= 1
                      ? "↺ 再生"
                      : "▶ 接近アニメーション"}
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
                <span className="text-xs text-slate-500">
                  {Math.round(progress * 100)}% — 最接近日時の惑星配置に合わせて再生
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(progress * 100)}
                onChange={(e) => {
                  setPlaying(false);
                  setProgress(Number(e.target.value) / 100);
                }}
                className="mt-4 w-full accent-orange-500"
              />
              <p className="mt-2 text-[10px] text-slate-500">
                データ: JPL SBDB / Sentry。衝突確率は接近距離と不確実性からの簡易推定（公式予報ではない）。軌道・惑星位置も接近日に連動した簡易モデルです。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
