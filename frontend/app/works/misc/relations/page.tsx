"use client";

import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import RelationWorkspacePanel from "@/components/works/RelationWorkspacePanel";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function WorksMiscRelationsPage() {
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
          <h1 className="display-section mt-4 text-white">関係図ワークスペース</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            最高裁・内閣官房・関連業者の人物と異動履歴・関係を個人管理します。
            相関図は全員表示と時点フィルタに対応。モバイルでは名刺撮影で項目を取り込みます。
            データは Azure Cosmos DB（Japan East）、AI は日本リージョン Azure OpenAI
            のみです。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <RelationWorkspacePanel />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
