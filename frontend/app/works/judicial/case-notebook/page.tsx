import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import CaseNotebookPanel from "@/components/works/judicial/CaseNotebookPanel";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function JudicialCaseNotebookPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <Link
            href="/works/judicial"
            className="eyebrow inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            ← 司法パネル
          </Link>
          <h1 className="display-section mt-4 text-white">訴訟記録ノート</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            NotebookLM
            風に、訴状・答弁書・書証などの訴訟記録を選び、Gemini
            で争点や時系列・証拠の対応関係を整理します。法的助言ではなく、記録の整理に限定した学習用ツールです。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <CaseNotebookPanel />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
