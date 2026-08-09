"use client";

import Link from "next/link";
import DocsPanel from "@/components/docs/DocsPanel";
import Reveal from "@/components/layout/Reveal";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function WorksMiscDocsPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <Link
            href="/works"
            className="eyebrow inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            ← Works / その他
          </Link>
          <h1 className="display-section mt-4 text-white">資料生成スタジオ</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            チャットで依頼すると、内部提案向けの PowerPoint（約5枚）を自動生成します。
            紺〜ブルー系のプロフェッショナルテンプレート。生成データはサーバーに保存しません。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <DocsPanel />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
