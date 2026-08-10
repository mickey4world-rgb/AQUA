"use client";

export default function AsteroidShowcaseDemo() {
  return (
    <div className="showcase-demo showcase-demo--asteroid">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame overflow-hidden p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-300/80">
              NEO Simulator
            </p>
            <p className="mt-0.5 text-sm text-white">(99942) Apophis — 接近軌道</p>
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
            <p className="font-mono text-[10px] text-slate-400">最接近距離</p>
            <p className="font-mono text-lg text-amber-200">31,300 km</p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">2029-04-13 · JPL CAD</p>
          </div>
        </div>
      </div>
    </div>
  );
}
