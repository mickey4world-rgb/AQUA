import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import ConsultWorkspace from "@/components/works/ConsultWorkspace";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function WorksConsultPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <Link
            href="/works"
            className="eyebrow inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            ← Works
          </Link>
          <h1 className="display-section mt-4 text-white">
            Consult<span className="text-emerald-400">.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            Gemini の無料枠で IT・AI・Claude Code の実装を相談します。会話がまとまったら「まとめる」を押すと、
            実装ステップと Claude Code 用プロンプトに整形して保存できます。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <ConsultWorkspace />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
