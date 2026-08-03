"use client";

import DocsPageShell from "@/components/docs/DocsPageShell";
import DocsPanel from "@/components/docs/DocsPanel";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function DocsPage() {
  return (
    <DocsPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300/80">
            Document Studio
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            資料生成
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            チャットで依頼すると、官公庁向け内部提案の PowerPoint（約5枚）を自動生成します。
            紺〜ブルー系のプロフェッショナルテンプレート。生成データはサーバーに保存しません。
          </p>
        </div>

        <div className="mt-8">
          <DocsPanel />
        </div>
      </main>
    </DocsPageShell>
  );
}
