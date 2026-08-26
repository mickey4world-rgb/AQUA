"use client";

import SolunaPageShell from "@/components/soluna/SolunaPageShell";
import SolunaPanel from "@/components/soluna/SolunaPanel";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function SolunaPage() {
  return (
    <SolunaPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80">
            Soluna Companion
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            ソルーナ
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            AI 合議とは別の、フレンドリーな育成型コンパニオン。
            <span className="text-amber-100/90"> ソル（太陽）</span> と
            <span className="text-indigo-100/90"> ルーナ（月）</span> が、あなたの言葉にそれぞれ答えます。
            毎朝の最新ニュースはモンスターになって現れ、2人の議論で討伐します。
            画像生成タブではベース立ち絵を参考に、無料枠で画像を作って保管できます。
          </p>
        </div>

        <div className="mt-8">
          <SolunaPanel />
        </div>
      </main>
    </SolunaPageShell>
  );
}
