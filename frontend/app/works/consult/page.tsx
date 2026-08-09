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
          <h1 className="display-section mt-4 text-white">AI 相談ボード</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            毎日ちょっとした相談を気軽に。話がまとまったら保存して、あとから見返せます。
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
