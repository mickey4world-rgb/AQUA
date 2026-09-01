"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDistanceKm } from "@/lib/space-utils";
import type { NeoPublicPreviewSnapshot } from "@/lib/types/space";

export default function AsteroidShowcaseDemo() {
  const [data, setData] = useState<NeoPublicPreviewSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/public/neo-preview")
      .then(async (res) => (res.ok ? ((await res.json()) as NeoPublicPreviewSnapshot) : null))
      .catch(() => null)
      .then(setData);
  }, []);

  const featured = data?.featured;

  return (
    <div className="showcase-demo showcase-demo--asteroid">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame overflow-hidden p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-300/80">
              NEO Simulator
            </p>
            <p className="mt-0.5 text-sm text-white">
              {featured
                ? `${featured.designation} — 接近軌道`
                : "地球接近小惑星 — 3D 軌道"}
            </p>
          </div>
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
            3D
          </span>
        </div>

        <div className="showcase-orbit-scene mt-4">
          <div className="showcase-orbit-stars" aria-hidden />
          <div className="showcase-orbit-ring showcase-orbit-ring--outer" aria-hidden />
          <div className="showcase-orbit-ring showcase-orbit-ring--inner" aria-hidden />
          <div className="showcase-earth" aria-hidden>
            <div className="showcase-earth__atmosphere" />
          </div>
          <div className="showcase-asteroid-orbit" aria-hidden>
            <div className="showcase-asteroid">
              <div className="showcase-asteroid__trail" />
            </div>
          </div>
          <div className="showcase-orbit-hud">
            {!featured ? (
              <>
                <p className="font-mono text-[10px] text-slate-400">読み込み中…</p>
                <p className="font-mono text-lg text-amber-200">JPL CAD</p>
              </>
            ) : (
              <>
                <p className="font-mono text-[10px] text-slate-400">最接近距離</p>
                <p className="font-mono text-lg text-amber-200">
                  {featured.distanceMinLd.toFixed(1)} LD
                </p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">
                  {formatDistanceKm(featured.distanceMinKm)} · {featured.closeApproachDateJst.slice(0, 12)}
                </p>
              </>
            )}
          </div>
        </div>

        <Link
          href="/neo-preview"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100 hover:bg-indigo-500/20"
        >
          本日最接近の 3D 軌道を見る →
        </Link>
      </div>
    </div>
  );
}
