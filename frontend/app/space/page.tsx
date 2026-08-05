"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import SpacePageShell from "@/components/space/SpacePageShell";
import TelescopeTimelineTab from "@/components/space/TelescopeTimelineTab";
import AsteroidSimulatorTab from "@/components/space/AsteroidSimulatorTab";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import type { SpaceTab } from "@/lib/types/space";

const EagleEyeTab = dynamic(() => import("@/components/space/EagleEyeTab"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
      <p className="text-sm text-slate-400">鷹の目タブを読み込み中...</p>
    </div>
  ),
});

const TABS: { key: SpaceTab; label: string; desc: string }[] = [
  {
    key: "telescope",
    label: "🔭 望遠鏡タイムライン",
    desc: "NASA APOD · 波長分析 · AI 解説",
  },
  {
    key: "asteroid",
    label: "☄️ 小惑星 3D シミュレーター",
    desc: "JPL 接近データ · 3D アニメーション",
  },
  {
    key: "eagle-eye",
    label: "🦅 鷹の目",
    desc: "衛星俯瞰 · 地上カメラ クローズアップ",
  },
];

export default function SpacePage() {
  const [tab, setTab] = useState<SpaceTab>("telescope");

  return (
    <SpacePageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/80">
            Cosmic Analytics
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            宇宙分析ラボ
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            宇宙望遠鏡の最新画像をタイムラインで表示し、波長分析と AI 解説ができます。
            小惑星接近データを 3D でシミュレーションし、地球への最接近距離を確認できます。
            「鷹の目」では衛星軌道を俯瞰し、地上カメラへ SF 映画のようなクローズアップ体験ができます。
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-full px-4 py-2.5 text-left transition ${
                tab === item.key
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span
                className={`block text-[10px] ${
                  tab === item.key ? "text-indigo-100/80" : "text-slate-500"
                }`}
              >
                {item.desc}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8">
          {tab === "telescope" && <TelescopeTimelineTab />}
          {tab === "asteroid" && <AsteroidSimulatorTab />}
          {tab === "eagle-eye" && <EagleEyeTab />}
        </div>
      </main>
    </SpacePageShell>
  );
}
