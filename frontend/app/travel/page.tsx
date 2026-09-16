import type { Metadata } from "next";
import TravelPageShell from "@/components/travel/TravelPageShell";
import TravelPanel from "@/components/travel/TravelPanel";

export const metadata: Metadata = {
  title: "Travel — 旅のしおり",
  description:
    "旅行の日時とコースを地図で可視化。旅行会社資料の判読、おすすめ提案、旅中メモと写真。",
  robots: { index: false, follow: false },
};

export default function TravelPage() {
  return (
    <TravelPageShell>
      <main>
        <header className="border-b border-white/10 bg-black/20 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <p className="text-[10px] tracking-[0.28em] text-teal-200/80 uppercase">
              Travel
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
              旅のしおり
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              日時とコースを地図で追い、手入力や旅行会社資料から観光ポイントを起こし、地点ごとの天気・乗り物表現、旅の途中の一言と写真も残せます。
            </p>
          </div>
        </header>
        <TravelPanel />
      </main>
    </TravelPageShell>
  );
}
