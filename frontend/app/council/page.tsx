"use client";

import CouncilPageShell from "@/components/council/CouncilPageShell";
import CouncilPanel from "@/components/council/CouncilPanel";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function CouncilPage() {
  return (
    <CouncilPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-300/80">
            Multi-AI Council
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            AI 合議
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            複数の AI モデルに同時相談し、互いの意見を読んだうえで議論。議長 AI が最終回答をまとめます。
            国内限定モードと、最新モデルを使う国内問わずモードを切り替えられます。
          </p>
        </div>

        <div className="mt-8">
          <CouncilPanel />
        </div>
      </main>
    </CouncilPageShell>
  );
}
